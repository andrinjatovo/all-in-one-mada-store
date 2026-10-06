import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatMGA } from "./Money";

export type Offer = {
  id: string; conversation_id: string; product_id: string; vendor_id: string; client_id: string; proposed_by: string;
  color: string | null; size: string | null; unit: string | null; quantity: number;
  public_unit_price_mga: number; unit_price_mga: number; status: string; expires_at: string | null; order_id: string | null; created_at: string;
};

const STATUS: Record<string, string> = { en_attente: "En attente", accepte: "Accepté", refuse: "Refusé", expire: "Expiré", utilise: "Utilisé", remplace: "Remplacé" };

export function NegotiateModal({ conversationId, vendorId, onClose, onDone }: { conversationId: string; vendorId: string; onClose: () => void; onDone: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from("products").select("id,title,price_mga,discount_percent,promo_until,stock,variants,images").eq("vendor_id", vendorId).eq("is_active", true).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setProducts(data ?? []));
  }, [vendorId]);
  const p = products.find((x) => x.id === pid);
  const pub = p ? (p.discount_percent > 0 && (!p.promo_until || new Date(p.promo_until) > new Date()) ? Math.floor(p.price_mga * (100 - p.discount_percent) / 100) : p.price_mga) : 0;
  const colors = [...new Set((p?.variants ?? []).flatMap((v: any) => v.colors ?? []))] as string[];
  const sizes = [...new Set((p?.variants ?? []).flatMap((v: any) => v.sizes ?? []))] as string[];

  async function send() {
    const n = Math.round(Number(price));
    if (!p || !n) return toast.error("Choisissez un produit et un prix");
    setBusy(true);
    const { error } = await supabase.rpc("propose_price_offer", { _conversation_id: conversationId, _product_id: pid, _quantity: qty, _unit_price: n, _color: color || undefined, _size: size || undefined });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Proposition envoyée");
    onDone(); onClose();
  }
  const sel = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-3 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-black">🤝 Négocier le prix</h3>
        <select value={pid} onChange={(e) => { setPid(e.target.value); setColor(""); setSize(""); }} className={sel}>
          <option value="">— Produit —</option>
          {products.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        {p && <p className="text-xs text-muted-foreground">Prix actuel : <strong>{formatMGA(pub)}</strong> · stock {p.stock}</p>}
        {colors.length > 0 && <select value={color} onChange={(e) => setColor(e.target.value)} className={sel}><option value="">Couleur</option>{colors.map((c) => <option key={c}>{c}</option>)}</select>}
        {sizes.length > 0 && <select value={size} onChange={(e) => setSize(e.target.value)} className={sel}><option value="">Taille / pointure</option>{sizes.map((c) => <option key={c}>{c}</option>)}</select>}
        <label className="block text-xs font-bold">Quantité<input type="number" min={1} max={p?.stock ?? 1000} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className={sel} /></label>
        <label className="block text-xs font-bold">Mon prix par unité (Ar)<input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} className={sel} /></label>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2 text-sm font-bold">Annuler</button>
          <button disabled={busy} onClick={send} className="flex-1 rounded-xl bg-mada-red py-2 text-sm font-bold text-primary-foreground">Proposer</button>
        </div>
      </div>
    </div>
  );
}

export function OfferCard({ offer, userId, title, onChanged }: { offer: Offer; userId: string; title: string; onChanged: () => void }) {
  const navigate = useNavigate();
  const [counter, setCounter] = useState("");
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addrId, setAddrId] = useState("");
  const [fee, setFee] = useState<number | null>(null);
  const expired = offer.status === "accepte" && offer.expires_at && new Date(offer.expires_at) <= new Date();
  const mine = offer.proposed_by === userId;
  const isClient = offer.client_id === userId;
  const canRespond = offer.status === "en_attente" && !mine;
  const total = offer.unit_price_mga * offer.quantity;
  const saved = (offer.public_unit_price_mga - offer.unit_price_mga) * offer.quantity;
  const variant = [offer.color, offer.size, offer.unit].filter(Boolean).join(" · ");

  async function respond(action: "accepte" | "refuse" | "contre") {
    const n = Math.round(Number(counter));
    if (action === "contre" && !n) return toast.error("Indiquez votre prix");
    setBusy(true);
    const { error } = await supabase.rpc("respond_price_offer", { _offer_id: offer.id, _action: action, ...(action === "contre" ? { _counter_price: n } : {}) });
    setBusy(false);
    if (error) return toast.error(error.message);
    setCounter(""); onChanged();
  }

  async function openPay() {
    setPaying(true);
    const { data } = await supabase.from("addresses").select("*").eq("user_id", userId).order("is_default", { ascending: false });
    setAddresses(data ?? []);
    if (data?.[0]) pickAddress(data[0].id);
  }
  async function pickAddress(id: string) {
    setAddrId(id); setFee(null);
    const { data } = await supabase.rpc("vendor_zone_fee", { _vendor_id: offer.vendor_id, _address_id: id });
    setFee(Number((data as any)?.fee_mga ?? 0));
  }
  async function pay() {
    const a = addresses.find((x) => x.id === addrId);
    if (!a || fee == null) return toast.error("Choisissez une adresse de livraison");
    setBusy(true);
    const label = a.formatted_address || [a.street, a.quartier, a.city, a.district, a.region, a.province].filter(Boolean).join(", ");
    const { data, error } = await supabase.rpc("pay_price_offer", { _offer_id: offer.id, _address: `${a.full_name} · ${a.phone} · ${label}`, _address_id: a.id, _delivery_fee: fee });
    setBusy(false);
    if (error) return toast.error(error.message.includes("insufficient balance") ? "Solde insuffisant — rechargez votre wallet" : error.message);
    toast.success("Commande créée ✅");
    setPaying(false); onChanged();
    if (data) navigate({ to: "/client" });
  }

  const accepted = offer.status === "accepte" && !expired;
  return (
    <div className={`mx-auto w-full max-w-sm rounded-2xl border-2 p-3 text-sm ${accepted ? "border-mada-green bg-mada-green/5" : "border-border bg-background"}`}>
      <div className="text-xs font-black uppercase">{accepted ? "✅ Prix négocié accepté" : offer.status === "utilise" ? "💳 Prix négocié utilisé" : `🤝 Proposition ${mine ? "envoyée" : "reçue"}`} · {expired ? "Expiré" : STATUS[offer.status]}</div>
      <div className="mt-1 font-bold">{title}</div>
      {variant && <div className="text-xs text-muted-foreground">{variant}</div>}
      <div className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
        <span>Quantité</span><span className="text-right font-bold">{offer.quantity}</span>
        <span>Prix normal</span><span className="text-right line-through">{formatMGA(offer.public_unit_price_mga)}</span>
        <span>Prix proposé</span><span className="text-right font-black text-mada-red">{formatMGA(offer.unit_price_mga)}</span>
        <span>Total produits</span><span className="text-right font-bold">{formatMGA(total)}</span>
        <span>Économie</span><span className="text-right font-bold text-mada-green">{formatMGA(saved)}</span>
        {offer.expires_at && <><span>Valable jusqu'au</span><span className="text-right">{new Date(offer.expires_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span></>}
      </div>
      {canRespond && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => respond("accepte")} className="flex-1 rounded-lg bg-mada-green py-1.5 text-xs font-bold text-secondary-foreground">✅ Accepter</button>
            <button disabled={busy} onClick={() => respond("refuse")} className="flex-1 rounded-lg border border-destructive py-1.5 text-xs font-bold text-destructive">❌ Refuser</button>
          </div>
          <div className="flex gap-2">
            <input type="number" value={counter} onChange={(e) => setCounter(e.target.value)} placeholder="Autre prix (Ar)" className="min-w-0 flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-xs" />
            <button disabled={busy} onClick={() => respond("contre")} className="rounded-lg border border-border px-2 text-xs font-bold">💰 Contre-proposer</button>
          </div>
        </div>
      )}
      {accepted && isClient && !paying && <button onClick={openPay} className="mt-2 w-full rounded-xl bg-mada-red py-2 font-black text-primary-foreground">PAYER</button>}
      {accepted && isClient && paying && (
        <div className="mt-2 space-y-2">
          {addresses.length === 0 ? <p className="text-xs">Ajoutez d'abord une adresse dans Profil → Adresses.</p> : (
            <select value={addrId} onChange={(e) => pickAddress(e.target.value)} className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs">
              {addresses.map((a) => <option key={a.id} value={a.id}>{a.full_name} — {a.quartier}, {a.city ?? a.district ?? a.region}</option>)}
            </select>
          )}
          {fee != null && <div className="text-xs">Livraison : <strong>{formatMGA(fee)}</strong> · Total : <strong className="text-mada-red">{formatMGA(total + fee)}</strong></div>}
          <button disabled={busy || fee == null} onClick={pay} className="w-full rounded-xl bg-mada-red py-2 font-black text-primary-foreground disabled:opacity-50">Confirmer le paiement</button>
        </div>
      )}
    </div>
  );
}
