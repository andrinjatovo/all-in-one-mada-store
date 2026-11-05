import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Minus, Plus, Trash2, ShoppingBag, Pencil, Ticket, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { LoginPrompt } from "@/components/madastore/LoginPrompt";
import { formatMGA } from "@/components/madastore/Money";
import { AddressSelector } from "@/components/madastore/AddressSelector";
import { ShippingQuoteCard, type Quote } from "@/components/madastore/ShippingQuoteCard";
import { BackButton } from "@/components/madastore/BackButton";
import { CartItemEditor, type ProductInfo } from "@/components/madastore/CartItemEditor";
import type { AddressRow } from "@/components/madastore/AddressForm";
import { useMarketplaceRules } from "@/components/madastore/ProductAvailabilityEditor";
import { computePreorderSplit, formatDateFr, totalPreorderDays } from "@/lib/preorder";
import {
  CartItem,
  cartTotal,
  getCart,
  lineTotal,
  lineUnitWithDiscount,
  removeIndexes,
  removeItem,
  setAllSelected,
  toggleSelected,
  updateItem,
  updateQty,
} from "@/lib/cart";
import {
  checkCoupon,
  getSelectedCouponId,
  setSelectedCouponId,
  type Coupon,
} from "@/lib/coupon";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Mon panier — ALL IN ONE MADA STORE" },
      { name: "description", content: "Sélectionnez vos produits, appliquez vos coupons et payez en toute sécurité." },
      { property: "og:title", content: "Mon panier — ALL IN ONE MADA STORE" },
      { property: "og:description", content: "Sélectionnez vos produits, appliquez vos coupons et payez en toute sécurité." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<AddressRow | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote | null>>({});
  const [paying, setPaying] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponId, setCouponId] = useState<string | null>(null);
  const [infos, setInfos] = useState<Record<string, ProductInfo>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const rules = useMarketplaceRules();

  const reload = useCallback(() => setItems(getCart()), []);

  useEffect(() => {
    reload();
    setCouponId(getSelectedCouponId());
    const h = () => reload();
    const c = () => setCouponId(getSelectedCouponId());
    window.addEventListener("dago-cart-changed", h);
    window.addEventListener("dago-coupon-changed", c);
    return () => {
      window.removeEventListener("dago-cart-changed", h);
      window.removeEventListener("dago-coupon-changed", c);
    };
  }, [reload]);

  const [askLogin, setAskLogin] = useState(false);

  // Coupons du client
  useEffect(() => {
    if (!user) return;
    supabase
      .from("coupons" as any)
      .select("id,code,percent,product_id,category_id,reason,expires_at,used_at")
      .eq("user_id", user.id)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("percent", { ascending: false })
      .limit(20)
      .then((r) => setCoupons((r.data ?? []) as unknown as Coupon[]));
  }, [user]);

  // Infos produits (stock, variantes, catégorie) pour les articles du panier
  const productIds = useMemo(
    () => Array.from(new Set(items.map((i) => i.product_id))).sort().join(","),
    [items],
  );
  useEffect(() => {
    const ids = productIds ? productIds.split(",") : [];
    if (ids.length === 0) return setInfos({});
    supabase
      .from("products")
      .select("id,category_id,stock,price_mga,discount_percent,promo_until,variants,images,availability,preorder,advance_percent")
      .in("id", ids)
      .then((r) => {
        const map: Record<string, ProductInfo> = {};
        (r.data ?? []).forEach((p: any) => (map[p.id] = p as ProductInfo));
        setInfos(map);
      });
  }, [productIds]);

  const selected = items.filter((i) => i.selected !== false);
  const selectedIdx = items.map((i, idx) => ({ i, idx })).filter((x) => x.i.selected !== false).map((x) => x.idx);
  const allSelected = items.length > 0 && selected.length === items.length;
  const categoryOf = useMemo(() => {
    const m: Record<string, string | null> = {};
    Object.values(infos).forEach((p) => (m[p.id] = p.category_id));
    return m;
  }, [infos]);

  const subtotal = cartTotal(selected);
  const vendors = useMemo(() => Array.from(new Set(selected.map((i) => i.vendor_id))), [selected]);
  const shipping = vendors.reduce((s, v) => s + (quotes[v]?.fee_mga ?? 0), 0);

  const activeCoupon = coupons.find((c) => c.id === couponId) ?? null;
  const eligibility = activeCoupon ? checkCoupon(activeCoupon, selected, categoryOf) : null;
  const discount =
    activeCoupon && eligibility?.ok && eligibility.lineIndex !== undefined
      ? Math.floor((lineTotal(selected[eligibility.lineIndex]) * activeCoupon.percent) / 100)
      : 0;

  const total = Math.max(0, subtotal - discount) + shipping;
  const preorderLines = selected
    .map((it) => ({ it, info: infos[it.product_id] }))
    .filter((x) => x.info?.availability === "sur_commande")
    .map(({ it, info }) => ({
      it,
      info,
      split: computePreorderSplit({
        itemsTotal: lineTotal(it),
        commissionRate: rules.commissionRate,
        advancePercent: Number(info.advance_percent ?? 0),
        maxAdvancePercent: rules.maxAdvancePercent,
      }),
    }));
  const canPay = selected.length > 0 && !!address && vendors.every((v) => !!quotes[v]);

  function useCoupon(c: Coupon) {
    const res = checkCoupon(c, selected, categoryOf);
    if (!res.ok) return toast.error(res.reason ?? "Coupon non applicable");
    setSelectedCouponId(c.id);
    setCouponId(c.id);
    toast.success(`Coupon ${c.code} appliqué : -${c.percent}%`);
  }

  async function pay() {
    if (!user) return setAskLogin(true);
    if (selected.length === 0) return toast.error("Sélectionnez au moins un produit");
    if (!address) return toast.error("Adresse requise");
    if (!canPay) return toast.error("Calcul de livraison incomplet");
    setPaying(true);
    const done: number[] = [];
    let couponUsed = false;
    for (let k = 0; k < selected.length; k++) {
      const it = selected[k];
      const q = quotes[it.vendor_id];
      const note = [
        it.color && `Couleur: ${it.color}`,
        it.size && `Taille: ${it.size}`,
        it.unit && `Unité: ${it.unit}`,
      ]
        .filter(Boolean)
        .join(" | ");
      const addrText = `${address.full_name} · ${address.phone} · ${[address.street, address.quartier, address.city, address.province]
        .filter(Boolean)
        .join(", ")}${note ? " | " + note : ""}`;
      // Le premier article de chaque vendeur porte les frais de livraison
      const shouldChargeShipping = selected.findIndex((x) => x.vendor_id === it.vendor_id) === k;
      const applyCoupon =
        !couponUsed && activeCoupon && eligibility?.ok && eligibility.lineIndex === k ? activeCoupon.id : null;
      const { error } = await supabase.rpc("place_order_v3" as any, {
        _product_id: it.product_id,
        _quantity: it.qty,
        _address: addrText,
        _address_id: address.id,
        _delivery_fee: shouldChargeShipping ? q?.fee_mga ?? 0 : 0,
        _delivery_km: q?.km ?? null,
        _delivery_days_min: q?.days_min ?? null,
        _delivery_days_max: q?.days_max ?? null,
        _coupon_id: applyCoupon,
      });
      if (error) {
        const msg = error.message.includes("insufficient balance")
          ? "Solde insuffisant. Rechargez votre wallet."
          : error.message.includes("insufficient stock")
            ? "Stock insuffisant."
            : error.message;
        toast.error(`${it.title}: ${msg}`);
      } else {
        if (applyCoupon) couponUsed = true;
        done.push(selectedIdx[k]);
      }
    }
    setPaying(false);
    if (done.length > 0) {
      removeIndexes(done); // les produits non sélectionnés restent dans le panier
      setSelectedCouponId(null);
      setCouponId(null);
      toast.success(`${done.length} commande(s) confirmée(s) 🎉`);
      navigate({ to: "/client" });
    }
  }

  return (
    <div className="min-h-screen bg-background pb-56">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <BackButton fallback={user ? "/client" : "/"} />
        <h1 className="text-sm font-black">Mon panier ({items.length})</h1>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Panier vide.{" "}
            <Link to={user ? "/client" : "/"} className="font-bold text-mada-red">
              Continuer mes achats →
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
              <label className="flex items-center gap-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => setAllSelected(e.target.checked)}
                  className="h-5 w-5 accent-[var(--color-mada-red)]"
                  aria-label="Tout sélectionner"
                />
                Tout sélectionner
              </label>
              <span className="text-xs text-muted-foreground">
                {selected.length} / {items.length} sélectionné(s)
              </span>
            </div>

            {items.map((it, idx) => {
              const discounted = it.qty >= 10;
              const unit = lineUnitWithDiscount(it);
              const info = infos[it.product_id];
              const isSelected = it.selected !== false;
              return (
                <div
                  key={`${it.product_id}-${idx}`}
                  className={`flex gap-3 rounded-2xl border bg-card p-3 transition-colors ${
                    isSelected ? "border-mada-red/50" : "border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(idx)}
                    className="mt-1 h-5 w-5 shrink-0 accent-[var(--color-mada-red)]"
                    aria-label={`Sélectionner ${it.title}`}
                  />
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {it.image ? (
                      <img src={it.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-2xl">📦</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-bold">{it.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                      {it.color && <span>🎨 {it.color}</span>}
                      {it.size && <span>· 📏 {it.size}</span>}
                      {it.unit && <span>· ⚖️ {it.unit}</span>}
                      <button
                        onClick={() => setEditing(idx)}
                        className="ml-1 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-bold text-foreground"
                      >
                        <Pencil className="h-3 w-3" /> Modifier
                      </button>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-sm font-black text-mada-red">{formatMGA(unit)}</span>
                      {discounted && (
                        <span className="text-[10px] text-muted-foreground line-through">
                          {formatMGA(it.unit_price_mga)}
                        </span>
                      )}
                    </div>
                    {info?.availability === "sur_commande" && (
                      <div className="mt-0.5 inline-block rounded-full bg-mada-red/15 px-2 py-0.5 text-[10px] font-black text-mada-red">
                        🚢 Sur commande · ≈ {totalPreorderDays(info.preorder)} j
                      </div>
                    )}
                    {info && info.stock < it.qty && (
                      <div className="mt-0.5 text-[10px] font-bold text-destructive">
                        Stock insuffisant (reste {info.stock})
                      </div>
                    )}
                    {discounted && (
                      <div className="mt-0.5 inline-block rounded-full bg-mada-green/10 px-2 py-0.5 text-[10px] font-bold text-mada-green">
                        -2% (x{it.qty})
                      </div>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => updateQty(idx, it.qty - 1)}
                          className="grid h-7 w-7 place-items-center rounded-md border border-border"
                          aria-label="Diminuer la quantité"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-black">{it.qty}</span>
                        <button
                          onClick={() => updateQty(idx, it.qty + 1)}
                          className="grid h-7 w-7 place-items-center rounded-md border border-border"
                          aria-label="Augmenter la quantité"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black">{formatMGA(lineTotal(it))}</span>
                        <button
                          onClick={() => removeItem(idx)}
                          className="text-muted-foreground hover:text-mada-red"
                          aria-label={`Supprimer ${it.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {items.length > 0 && user && (
          <>
            {/* Coupons */}
            <div className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-sm font-black">
                <Ticket className="h-4 w-4 text-mada-green" /> Mes coupons
              </div>
              {coupons.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Aucun coupon disponible pour le moment.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {coupons.map((c) => {
                    const res = checkCoupon(c, selected, categoryOf);
                    const active = couponId === c.id && res.ok;
                    return (
                      <div
                        key={c.id}
                        className={`flex items-center gap-3 rounded-xl border p-2.5 ${
                          active ? "border-mada-green bg-mada-green/10" : "border-border"
                        }`}
                      >
                        <div className="grid h-10 w-12 shrink-0 place-items-center rounded-lg bg-mada-red text-xs font-black text-primary-foreground">
                          -{c.percent}%
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[11px] font-bold">{c.code}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {res.ok
                              ? c.product_id
                                ? "Valable sur un produit de votre sélection"
                                : c.category_id
                                  ? "Valable sur la catégorie sélectionnée"
                                  : "Valable sur tous les produits"
                              : res.reason}
                          </div>
                        </div>
                        {active ? (
                          <button
                            onClick={() => {
                              setSelectedCouponId(null);
                              setCouponId(null);
                            }}
                            className="inline-flex items-center gap-1 rounded-full bg-mada-green px-3 py-1.5 text-xs font-black text-secondary-foreground"
                          >
                            <Check className="h-3 w-3" /> Appliqué
                          </button>
                        ) : (
                          <button
                            onClick={() => useCoupon(c)}
                            disabled={!res.ok}
                            className="rounded-full bg-mada-red px-4 py-1.5 text-xs font-black text-primary-foreground disabled:opacity-40"
                          >
                            USE
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {preorderLines.length > 0 && (
              <div className="space-y-1 rounded-2xl border border-mada-red/40 bg-mada-red/5 p-3 text-[11px]">
                <div className="text-sm font-black">🚢 Produits sur commande — paiement protégé</div>
                {preorderLines.map(({ it, split, info }) => (
                  <div key={`${it.product_id}-${it.color}-${it.size}`} className="rounded-lg bg-card p-2">
                    <div className="font-bold">{it.title}</div>
                    <div className="flex justify-between"><span>Payé maintenant</span><strong>{formatMGA(split.total)}</strong></div>
                    <div className="flex justify-between"><span>Avance vendeur à l'acceptation ({split.percent} %)</span><strong>{formatMGA(split.advance)}</strong></div>
                    <div className="flex justify-between"><span>Conservé jusqu'à votre confirmation de réception</span><strong>{formatMGA(split.protectedAmount)}</strong></div>
                    <div className="text-muted-foreground">Disponibilité estimée : {formatDateFr(info.preorder?.available_at)} · ≈ {totalPreorderDays(info.preorder)} jours</div>
                  </div>
                ))}
                <p className="text-muted-foreground">Montants hors livraison et hors coupon ; le calcul définitif est fait au paiement.</p>
              </div>
            )}
            <AddressSelector userId={user.id} value={address?.id ?? null} onChange={setAddress} />
            {vendors.map((v) => (
              <ShippingQuoteCard
                key={v}
                vendorId={v}
                addressId={address?.id ?? null}
                onQuote={(q) => setQuotes((prev) => ({ ...prev, [v]: q }))}
              />
            ))}
          </>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-4 py-3 shadow-2xl">
          <div className="mx-auto max-w-2xl space-y-1.5">
            <Row label={`Sous-total (${selected.length} produit${selected.length > 1 ? "s" : ""})`} value={formatMGA(subtotal)} />
            {discount > 0 && activeCoupon && (
              <Row
                label={`Coupon ${activeCoupon.code} (-${activeCoupon.percent}%)`}
                value={`-${formatMGA(discount)}`}
                green
              />
            )}
            <Row label="Livraison" value={shipping ? formatMGA(shipping) : "—"} />
            <div className="flex items-center justify-between gap-3 pt-1">
              <div>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Total à payer</div>
                <div className="text-xl font-black text-mada-red">{formatMGA(total)}</div>
              </div>
              <button
                onClick={pay}
                disabled={paying || (!!user && !canPay)}
                className="inline-flex items-center gap-2 rounded-full bg-mada-red px-6 py-3 text-sm font-black text-primary-foreground shadow-glow-red disabled:opacity-50"
              >
                <ShoppingBag className="h-4 w-4" />
                {paying
                  ? "Paiement..."
                  : selected.length === 0
                    ? "Sélectionnez"
                    : !user
                      ? `Continuer (${selected.length})`
                    : !address
                      ? "Adresse requise"
                      : `Payer (${selected.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {askLogin && <LoginPrompt reason="buy" returnPath="/cart" onClose={() => setAskLogin(false)} />}
      {editing !== null && items[editing] && (
        <CartItemEditor
          item={items[editing]}
          info={infos[items[editing].product_id]}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateItem(editing, patch);
            setEditing(null);
            toast.success("Produit mis à jour");
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-xs ${green ? "text-mada-green font-bold" : "text-muted-foreground"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
