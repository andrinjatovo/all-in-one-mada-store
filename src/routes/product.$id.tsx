import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, dashboardPathForRole } from "@/lib/auth";
import { formatMGA, formatUSDT } from "@/components/madastore/Money";
import { addToCart } from "@/lib/cart";
import { AddressSelector } from "@/components/madastore/AddressSelector";
import { ShippingQuoteCard, type Quote } from "@/components/madastore/ShippingQuoteCard";
import type { AddressRow } from "@/components/madastore/AddressForm";
import { MessageCircle, ShoppingBag, Heart, Send, ShoppingCart, X, Minus, Plus, Store, ThumbsUp, Clock3, PackageCheck } from "lucide-react";
import { BackButton } from "@/components/madastore/BackButton";
import { ProductGallery } from "@/components/madastore/ProductGallery";
import { ProductShare } from "@/components/madastore/ProductShare";
import { ProductReviews, Stars } from "@/components/madastore/ProductReviews";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/product/$id")({
  head: () => ({ meta: [
    { title: "Voir le produit — ALL IN ONE MADA STORE" },
    { name: "description", content: "Prix, variantes, avis vérifiés et livraison d’un produit sur ALL IN ONE MADA STORE." },
    { property: "og:title", content: "Voir le produit — ALL IN ONE MADA STORE" },
    { property: "og:description", content: "Découvrez ce produit, ses variantes et les avis clients vérifiés." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: ProductPage,
});

type Variant = { image_index: number; price_mga: number; colors: string[]; sizes: string[]; units?: string[]; custom?: string };
type Comment = { id: string; user_id: string; author_name: string | null; content: string; created_at: string };

function usePromoRemaining(until: string | null | undefined, active: boolean) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!until || !active) { setLabel(""); return; }
    function refresh() {
      const remaining = Math.max(0, new Date(until as string).getTime() - Date.now());
      const days = Math.floor(remaining / 86_400_000);
      const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);
      setLabel(remaining === 0 ? "terminée" : days > 0 ? `${days} j ${hours} h restantes` : `${hours} h ${minutes} min restantes`);
    }
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(timer);
  }, [until, active]);
  return label;
}

function ProductPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const [p, setP] = useState<any>(null);
  const [vendor, setVendor] = useState<any>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  const [likes, setLikes] = useState(0);
  const [loves, setLoves] = useState(0);
  const [reaction, setReaction] = useState<"like" | "love" | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  // Popup state
  const [popup, setPopup] = useState<null | "cart" | "buy">(null);
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);
  const [address, setAddress] = useState<AddressRow | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("products").select("*").eq("id", id).eq("is_active", true).maybeSingle();
      setP(data);
      if (data) {
        const { data: v } = await supabase.from("vendor_profiles").select("id,shop_name,phone,logo_url,description,created_at,rating_avg,rating_count").eq("id", data.vendor_id).maybeSingle();
        setVendor(v);
        supabase.rpc("increment_product_view" as any, { _product_id: id } as any).then(() => {});
        supabase.rpc("track_event" as any, { _event_type: "view", _product_id: id } as any).then(() => {});

      }
      setLoading(false);
    })();
  }, [id]);

  // Temps passé sur la fiche produit → apprentissage IA
  useEffect(() => {
    const start = Date.now();
    return () => {
      const ms = Date.now() - start;
      if (ms > 2000) {
        supabase
          .rpc("track_event" as any, { _event_type: "dwell", _product_id: id, _dwell_ms: Math.min(ms, 600000) } as any)
          .then(() => {});
      }
    };
  }, [id]);


  async function reloadEngagement() {
    const [{ data: l }, { data: c }] = await Promise.all([
      supabase.from("product_likes").select("user_id,reaction").eq("product_id", id),
      supabase.from("product_comments").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(50),
    ]);
    setLikes(l?.filter((item: any) => (item.reaction ?? "like") === "like").length ?? 0);
    setLoves(l?.filter((item: any) => item.reaction === "love").length ?? 0);
    setReaction((l?.find((item: any) => item.user_id === user?.id)?.reaction as "like" | "love" | undefined) ?? null);
    setComments((c ?? []) as Comment[]);
  }

  useEffect(() => {
    if (p) reloadEngagement();
  }, [p, user]);

  useEffect(() => {
    if (!authLoading && !user) {
      window.sessionStorage.setItem("mada-return-after-login", window.location.pathname + window.location.search);
      navigate({ to: "/auth/client" });
    }
  }, [authLoading, user, navigate]);

  const variants: Variant[] = Array.isArray(p?.variants) ? p.variants : [];
  const currentVariant = variants.find((v) => v.image_index === imgIdx) ?? variants[0];
  const basePrice = currentVariant?.price_mga ?? p?.price_mga ?? 0;
  const promoPct =
    p?.discount_percent > 0 && (!p?.promo_until || new Date(p.promo_until) > new Date()) ? p.discount_percent : 0;
  const displayPrice = promoPct ? Math.floor((basePrice * (100 - promoPct)) / 100) : basePrice;
  const discounted = qty >= 10;
  const effUnit = discounted ? Math.floor(displayPrice * 0.98) : displayPrice;
  const promoRemaining = usePromoRemaining(p?.promo_until, promoPct > 0);


  function openPopup(mode: "cart" | "buy") {
    setQty(1);
    setColor(null);
    setSize(null);
    setUnit(null);
    setPopup(mode);
  }

  function confirmAddToCart() {
    if (currentVariant?.colors?.length && !color) return toast.error("Choisissez une couleur");
    if (currentVariant?.sizes?.length && !size) return toast.error("Choisissez une taille/pointure");
    if (currentVariant?.units?.length && !unit) return toast.error("Choisissez une unité");
    addToCart({
      product_id: p.id,
      vendor_id: p.vendor_id,
      title: p.title,
      image: p.images?.[imgIdx] ?? p.images?.[0] ?? null,
      unit_price_mga: displayPrice,
      qty,
      color,
      size,
      unit,
    });
    toast.success("Ajouté au panier 🛒");
    setPopup(null);
  }

  async function confirmBuy() {
    if (!user) return;
    if (currentVariant?.colors?.length && !color) return toast.error("Choisissez une couleur");
    if (currentVariant?.sizes?.length && !size) return toast.error("Choisissez une taille/pointure");
    if (currentVariant?.units?.length && !unit) return toast.error("Choisissez une unité");
    if (!address) return toast.error("Adresse de livraison requise");
    if (!quote) return toast.error("Livraison en cours de calcul...");
    setBuying(true);
    const note = [color && `Couleur: ${color}`, size && `Taille: ${size}`, unit && `Unité: ${unit}`].filter(Boolean).join(" | ");
    const addrText = `${address.full_name} · ${address.phone} · ${[address.street, address.quartier, address.city, address.province].filter(Boolean).join(", ")}${note ? " | " + note : ""}`;
    const { error } = await supabase.rpc("place_order" as any, {
      _product_id: id,
      _quantity: qty,
      _address: addrText,
      _address_id: address.id,
      _delivery_fee: quote.fee_mga,
      _delivery_km: quote.km,
      _delivery_days_min: quote.days_min,
      _delivery_days_max: quote.days_max,
    });
    setBuying(false);
    if (error) {
      const msg = error.message.includes("insufficient balance")
        ? "Solde insuffisant. Rechargez votre wallet."
        : error.message.includes("insufficient stock")
        ? "Stock insuffisant."
        : error.message;
      return toast.error(msg);
    }
    toast.success("Commande confirmée 🎉");
    navigate({ to: "/client" });
  }

  async function contactSeller() {
    if (!user || !vendor) return;
    const { data: existing } = await supabase
      .from("conversations").select("id").eq("client_id", user.id).eq("vendor_id", vendor.id).maybeSingle();
    let conversationId = existing?.id;
    if (!conversationId) {
      const { data: created, error } = await supabase.from("conversations").insert({ client_id: user.id, vendor_id: vendor.id }).select("id").single();
      if (error) return toast.error(error.message);
      conversationId = created.id;
    }
    navigate({ to: "/conversation/$id", params: { id: conversationId } });
  }

  async function toggleReaction(next: "like" | "love") {
    if (!user) return;
    if (reaction === next) {
      await supabase.from("product_likes").delete().eq("product_id", id).eq("user_id", user.id);
    } else if (reaction) {
      await supabase.from("product_likes").update({ reaction: next }).eq("product_id", id).eq("user_id", user.id);
    } else {
      await supabase.from("product_likes").insert({ product_id: id, user_id: user.id, reaction: next });
    }
    reloadEngagement();
  }

  async function postComment() {
    if (!user || !newComment.trim()) return;
    const content = newComment.trim().slice(0, 1000);
    const { error } = await supabase.from("product_comments").insert({
      product_id: id,
      user_id: user.id,
      author_name: user.email?.split("@")[0] ?? "Utilisateur",
      content,
    });
    if (error) return toast.error(error.message);
    setNewComment("");
    reloadEngagement();
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Chargement...</div></div>;
  if (!p) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Produit introuvable.</div>;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 backdrop-blur px-4 py-3">
        <BackButton fallback={dashboardPathForRole(role)} />
        <h1 className="text-sm font-black truncate flex-1">{p.title}</h1>
        <Link to="/cart" className="rounded-lg p-1 hover:bg-muted"><ShoppingCart className="h-5 w-5" /></Link>
      </header>

      <div className="mx-auto max-w-5xl py-4 space-y-5">
        {/* Slider images */}
        <ProductGallery images={p.images ?? []} title={p.title} active={imgIdx} onChange={setImgIdx} />

        {p.video_url && (
          <video src={p.video_url} controls className="w-full rounded-2xl bg-black aspect-video" />
        )}

        <div className="space-y-3 px-4 sm:px-0">
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-black text-mada-red">{formatMGA(displayPrice)}</div>
            {promoPct > 0 && (
              <>
                <span className="text-sm text-muted-foreground line-through">{formatMGA(basePrice)}</span>
                <span className="rounded-full bg-mada-red px-2 py-0.5 text-[10px] font-black text-primary-foreground">
                  -{promoPct}%
                </span>
              </>
            )}
            <div className="inline-block rounded-full bg-mada-green/10 px-2 py-0.5 text-[10px] font-bold text-mada-green">
              -2% dès 10
            </div>

          </div>
          <div className="text-sm text-muted-foreground">≈ {formatUSDT(displayPrice)}</div>
          <h2 className="mt-2 text-lg font-bold">{p.title}</h2>
          {promoPct > 0 && p.promo_until && <div className="inline-flex items-center gap-2 rounded-md border border-mada-red/40 bg-mada-red/10 px-3 py-2 text-xs font-bold text-mada-red"><Clock3 className="h-4 w-4" /> Promotion limitée · {promoRemaining}</div>}
          <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{p.description}</p>
          <div className="flex flex-wrap gap-3 text-xs"><span>Stock disponible : <strong>{p.stock}</strong></span><span className="inline-flex items-center gap-1"><PackageCheck className="h-4 w-4 text-mada-green" /> <strong>{p.sold_count ?? 0}</strong> vendus</span><Stars value={Number(p.rating_avg ?? 0)} count={p.rating_count ?? 0} /></div>
        </div>

        {/* Reactions row */}
        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-0">
          <Button variant={reaction === "like" ? "default" : "outline"} size="sm" onClick={() => toggleReaction("like")}><ThumbsUp /> J’aime {likes}</Button>
          <Button variant={reaction === "love" ? "default" : "outline"} size="sm" onClick={() => toggleReaction("love")}><Heart className={reaction === "love" ? "fill-current" : ""} /> J’adore {loves}</Button>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold">
            <MessageCircle className="h-4 w-4" /> {comments.length}
          </div>
          <ProductShare title={p.title} />
        </div>

        {vendor && (
          <div className="mx-4 flex items-center justify-between gap-3 rounded-md border border-border bg-card p-4 sm:mx-0">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted font-black">{vendor.logo_url ? <img src={vendor.logo_url} alt={`Logo ${vendor.shop_name}`} className="h-full w-full object-cover" /> : vendor.shop_name.slice(0, 1)}</div><div className="min-w-0">
              <div className="text-[10px] font-bold uppercase text-muted-foreground">Vendeur</div>
              <div className="truncate font-bold text-sm">{vendor.shop_name}</div><Stars value={Number(vendor.rating_avg ?? 0)} count={vendor.rating_count ?? 0} />
            </div></div>
            <Button asChild variant="outline" size="sm"><Link to="/shop/$vendorId" params={{ vendorId: vendor.id }}><Store /> Voir la boutique</Link></Button>
          </div>
        )}

        <div className="mx-4 rounded-md border border-border bg-card p-4 space-y-3 sm:mx-0">
          <h3 className="text-sm font-black">💬 Commentaires</h3>
          {user && (
            <div className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Votre commentaire..."
                maxLength={1000}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <Button onClick={postComment} size="icon" aria-label="Publier le commentaire"><Send /></Button>
            </div>
          )}
          {comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucun commentaire.</p>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg border border-border/50 p-2">
                  <div className="text-[10px] font-bold text-muted-foreground">{c.author_name ?? "Utilisateur"} · {new Date(c.created_at).toLocaleDateString("fr-FR")}</div>
                  <div className="text-sm">{c.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 sm:px-0"><ProductReviews productId={id} vendorId={p.vendor_id} userId={user?.id} ratingAvg={Number(p.rating_avg ?? 0)} ratingCount={p.rating_count ?? 0} onPublished={() => supabase.from("products").select("*").eq("id", id).single().then(({ data }) => data && setP(data))} /></div>
      </div>

      {/* Bottom fixed action bar */}
      {role === "client" && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <Button variant="outline" onClick={contactSeller} className="h-12 flex-1 flex-col gap-0 text-[10px]">
              <MessageCircle className="h-5 w-5 text-mada-green" />
              Message
            </Button>
            <Button variant="outline" onClick={() => openPopup("cart")} className="h-12 flex-1 flex-col gap-0 text-[10px]">
              <ShoppingCart className="h-5 w-5 text-mada-red" />
              Panier
            </Button>
            <Button onClick={() => openPopup("buy")} disabled={p.stock === 0} className="h-12 flex-[2] font-black shadow-glow-red">
              <ShoppingBag className="h-4 w-4" /> {p.stock === 0 ? "Rupture" : "Acheter"}
            </Button>
          </div>
        </div>
      )}

      {/* Variant popup */}
      {popup && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50" onClick={() => setPopup(null)}>
          <div className="w-full max-w-lg rounded-t-3xl bg-card p-5 space-y-4 animate-in slide-in-from-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                {p.images?.[imgIdx] && <img src={p.images[imgIdx]} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-black text-mada-red">{formatMGA(effUnit)}</div>
                {discounted && (
                  <div className="text-[10px] text-mada-green font-bold">-2% appliqué (x{qty})</div>
                )}
                <div className="text-xs text-muted-foreground">Stock: {p.stock}</div>
              </div>
              <button onClick={() => setPopup(null)} className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            {currentVariant?.colors?.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase mb-2">Couleur</div>
                <div className="flex flex-wrap gap-2">
                  {currentVariant.colors.map((c) => (
                    <button key={c} onClick={() => setColor(c)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${color === c ? "border-mada-red bg-mada-red text-primary-foreground" : "border-border"}`}>{c}</button>
                  ))}
                </div>
              </div>
            )}
            {currentVariant?.sizes?.length > 0 && (
              <div>
                <div className="text-xs font-bold uppercase mb-2">Taille / pointure</div>
                <div className="flex flex-wrap gap-2">
                  {currentVariant.sizes.map((s) => (
                    <button key={s} onClick={() => setSize(s)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${size === s ? "border-mada-green bg-mada-green text-secondary-foreground" : "border-border"}`}>{s}</button>
                  ))}
                </div>
              </div>
            )}
            {((currentVariant?.units && currentVariant.units.length > 0) || currentVariant?.custom) && (
              <div>
                <div className="text-xs font-bold uppercase mb-2">Unité / mesure</div>
                <div className="flex flex-wrap gap-2">
                  {currentVariant?.units?.map((u) => (
                    <Button type="button" key={u} variant={unit === u ? "default" : "outline"} size="sm" onClick={() => setUnit(u)}>{u}</Button>
                  ))}
                  {currentVariant?.custom && (
                    <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs">{currentVariant.custom}</span>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-bold uppercase mb-2">Quantité</div>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-border"><Minus className="h-4 w-4" /></button>
                <span className="w-10 text-center font-black">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(p.stock, q + 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-border"><Plus className="h-4 w-4" /></button>
                <span className="ml-2 text-xs text-muted-foreground">10+ = -2%</span>
              </div>
            </div>

            {popup === "buy" && user && (
              <div className="space-y-2">
                <AddressSelector userId={user.id} value={address?.id ?? null} onChange={setAddress} />
                <ShippingQuoteCard
                  vendorId={p.vendor_id}
                  addressId={address?.id ?? null}

                  onQuote={setQuote}
                />
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-bold">Sous-total</span>
              <span className="text-sm font-black">{formatMGA(effUnit * qty)}</span>
            </div>
            {popup === "buy" && quote && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Livraison</span><span>{formatMGA(quote.fee_mga)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">Total</span>
              <span className="text-xl font-black text-mada-red">{formatMGA(effUnit * qty + (popup === "buy" ? (quote?.fee_mga ?? 0) : 0))}</span>
            </div>

            {popup === "cart" ? (
              <button onClick={confirmAddToCart} className="w-full rounded-xl bg-mada-green py-3 text-sm font-black text-secondary-foreground">
                Ajouter au panier
              </button>
            ) : (
              <button onClick={confirmBuy} disabled={buying} className="w-full rounded-xl bg-mada-red py-3 text-sm font-black text-primary-foreground disabled:opacity-50">
                {buying ? "Achat..." : "Confirmer l'achat"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
