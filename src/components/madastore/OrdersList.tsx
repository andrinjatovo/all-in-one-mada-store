import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMGA } from "./Money";
import { ShippingModal } from "./ShippingModal";
import { DeliveryEditModal } from "./DeliveryEditModal";

type Order = {
  id: string;
  product_title: string;
  product_image: string | null;
  quantity: number;
  total_mga: number;
  status: string;
  created_at: string;
  vendor_released?: boolean;
  buyer_confirmed_at?: string | null;
  auto_release_at?: string | null;
  tracking_status?: string | null;
  shipping_address?: string | null;
  tracking_code?: string | null;
  client_hidden?: boolean;
  delivery_fee_mga?: number | null;
  delivery_days_min?: number | null;
  delivery_days_max?: number | null;
  depart_at?: string | null;
  depart_city?: string | null;
  courier_name?: string | null;
  coop_name?: string | null;
  shipping_mode?: string | null;
  vendor_acceptance?: string;
  vendor_refusal_reason?: string | null;
  updated_at?: string;
  released_at?: string | null;
  delivered_at?: string | null;
  vendor_decided_at?: string | null;
  variant_label?: string | null;
  negotiated_offer_id?: string | null;
};


const STATUS_LABELS: Record<string, string> = {
  en_attente: "En attente",
  paye: "Payée",
  expedie: "Expédiée",
  livre: "Livrée",
  annule: "Annulée",
  rembourse: "Remboursée",
};
const STATUS_COLORS: Record<string, string> = {
  en_attente: "bg-yellow-100 text-yellow-800",
  paye: "bg-blue-100 text-blue-800",
  expedie: "bg-purple-100 text-purple-800",
  livre: "bg-mada-green/15 text-mada-green",
  annule: "bg-destructive/15 text-destructive",
  rembourse: "bg-muted text-muted-foreground",
};
const TRACK_LABEL: Record<string, string> = {
  prepare: "📦 Préparé",
  prepared: "📦 Colis préparé",
  shipped: "🚚 Départ",
  in_transit: "🛣️ En route",
  nearby: "📍 À proximité",
  at_depot: "🏢 En dépôt",
  arrived: "📍 Arrivé",
  delivered: "🏠 Livré",
  cancelled: "❌ Annulé",
};
const VENDOR_STEPS: { id: string; label: string }[] = [
  { id: "prepared", label: "📦 Préparé" },
  { id: "shipped", label: "🚚 Départ" },
  { id: "in_transit", label: "🛣️ En route" },
  { id: "nearby", label: "📍 À proximité" },
  { id: "at_depot", label: "🏢 En dépôt" },
  { id: "delivered", label: "🏠 Livré" },
  { id: "cancelled", label: "❌ Annuler" },
];


export function OrdersList({ userId, role }: { userId: string; role: "client" | "vendeur" }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [shipOrder, setShipOrder] = useState<Order | null>(null);
  const [editOrder, setEditOrder] = useState<Order | null>(null);

  async function load() {
    setLoading(true);
    const col = role === "client" ? "client_id" : "vendor_id";
    let req = supabase
      .from("orders")
      .select("id, product_title, product_image, quantity, total_mga, status, created_at, vendor_released, buyer_confirmed_at, auto_release_at, tracking_status, shipping_address, tracking_code, client_hidden, delivery_fee_mga, delivery_days_min, delivery_days_max, depart_at, depart_city, courier_name, coop_name, shipping_mode, vendor_acceptance, vendor_refusal_reason, updated_at, released_at, delivered_at, buyer_confirmed_at, vendor_decided_at, variant_label, negotiated_offer_id" as any)

      .eq(col, userId)
      .order("created_at", { ascending: false });
    if (role === "client") req = req.eq("client_hidden", false);
    const { data } = await req;
    let list = (data ?? []) as any as Order[];
    if (role === "client") {
      const limit = Date.now() - 5 * 86_400_000;
      list = list.filter((o) => {
        if (!["livre", "annule", "rembourse"].includes(o.status)) return true;
        const end = o.released_at ?? o.buyer_confirmed_at ?? o.delivered_at ?? o.vendor_decided_at ?? o.updated_at ?? o.created_at;
        return new Date(end).getTime() > limit;
      });
    }
    setOrders(list);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId, role]);

  // Realtime sync: refresh list on any change to orders touching this user
  useEffect(() => {
    const col = role === "client" ? "client_id" : "vendor_id";
    const ch = supabase
      .channel(`orders-${role}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `${col}=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role]);

  async function setTracking(id: string, status: string) {
    if (status === "cancelled" && !confirm("Annuler la livraison de cette commande ?")) return;
    const { error } = await supabase.rpc("vendor_set_tracking" as any, { _order_id: id, _status: status } as any);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    load();
  }

  async function decide(id: string, accept: boolean) {
    let reason: string | null = null;
    if (!accept) {
      reason = prompt("Motif du refus (le client sera remboursé) :");
      if (reason === null) return;
    }
    const { error } = await supabase.rpc("vendor_decide_order", { _order_id: id, _accept: accept, _reason: reason ?? undefined });
    if (error) return toast.error(error.message);
    toast.success(accept ? "Commande acceptée ✅" : "Commande refusée, client remboursé");
    load();
  }

  async function markInTransit(id: string) {

    const { error } = await supabase.rpc("vendor_mark_in_transit" as any, { _order_id: id });
    if (error) return toast.error(error.message);
    toast.success("En cours de livraison 🛣️");
    load();
  }

  if (loading) return <p className="text-sm text-muted-foreground">Chargement...</p>;
  if (orders.length === 0)
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Aucune commande {role === "client" ? "passée" : "reçue"}.
      </div>
    );

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
            {o.product_image ? <img src={o.product_image} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl">📦</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="line-clamp-2 text-sm font-bold">{o.product_title}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Qté: {o.quantity} · {new Date(o.created_at).toLocaleDateString("fr-FR")}</span>
              {o.tracking_code && (
                <button
                  onClick={() => { navigator.clipboard?.writeText(o.tracking_code!); toast.success("Numéro copié"); }}
                  className="rounded bg-mada-green/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-mada-green"
                  title="Copier le numéro de suivi"
                >
                  #{o.tracking_code}
                </button>
              )}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-sm font-black text-mada-red">{formatMGA(o.total_mga)}</span>
              <div className="flex items-center gap-1 flex-wrap justify-end">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span>
                {o.tracking_status && o.tracking_status !== "prepare" && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{TRACK_LABEL[o.tracking_status] ?? o.tracking_status}</span>
                )}
              </div>
            </div>

            {o.variant_label && <div className="text-[11px] text-muted-foreground">{o.variant_label}{o.negotiated_offer_id && " · prix négocié"}</div>}
            {o.vendor_acceptance === "en_attente" && (
              <div className="mt-2 rounded-lg bg-yellow-500/10 px-2 py-1 text-[11px] font-bold">⏳ En attente d'acceptation vendeur{role === "client" && " — Facture disponible après acceptation de la commande par le vendeur."}</div>
            )}
            {o.vendor_acceptance === "refuse" && (
              <div className="mt-2 rounded-lg bg-destructive/10 px-2 py-1 text-[11px] font-bold text-destructive">❌ Commande refusée{o.vendor_refusal_reason && ` — ${o.vendor_refusal_reason}`} · montant remboursé</div>
            )}
            {role === "vendeur" && o.vendor_acceptance === "en_attente" && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => decide(o.id, true)} className="rounded-lg bg-mada-green px-3 py-1 text-xs font-bold text-secondary-foreground">✅ Accepter la commande</button>
                <button onClick={() => decide(o.id, false)} className="rounded-lg border border-destructive px-3 py-1 text-xs font-bold text-destructive">❌ Refuser</button>
              </div>
            )}
            {o.vendor_acceptance === "accepte" && (
              <Link to="/order/$id/invoice" params={{ id: o.id }} className="mt-2 inline-block rounded-lg border border-border px-3 py-1 text-xs font-bold hover:border-mada-red">🧾 {role === "client" ? "Télécharger la facture" : "Voir la facture"}</Link>
            )}

            {/* Vendor actions */}
            {role === "vendeur" && o.vendor_acceptance !== "en_attente" && o.vendor_acceptance !== "refuse" && (
              <div className="mt-2 flex flex-wrap gap-2">
                {o.status === "paye" && !o.tracking_status?.match(/shipped|in_transit|nearby|at_depot|delivered/) && (
                  <button onClick={() => setShipOrder(o)} className="rounded-lg bg-mada-green px-3 py-1 text-xs font-bold text-secondary-foreground">
                    🚚 Expédier
                  </button>
                )}
                <button onClick={() => setEditOrder(o)} className="rounded-lg border border-border px-3 py-1 text-xs font-bold hover:border-mada-red">
                  ✏️ Modifier livraison
                </button>
                {o.delivery_fee_mga != null && (
                  <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                    Frais: {formatMGA(Number(o.delivery_fee_mga))}
                  </span>
                )}
              </div>
            )}

            {role === "vendeur" && o.vendor_acceptance === "accepte" && (
              <div className="mt-2 space-y-1">
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Statut du colis</div>
                <div className="flex flex-wrap gap-1">
                  {VENDOR_STEPS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setTracking(o.id, s.id)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                        o.tracking_status === s.id
                          ? "border-mada-red bg-mada-red text-primary-foreground"
                          : "border-border bg-card hover:border-mada-red"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}


            {/* Tracking link for both */}
            {(o.status === "expedie" || o.status === "livre" || o.tracking_status === "in_transit") && (
              <Link to="/order/$id/tracking" params={{ id: o.id }} className="mt-2 ml-2 inline-block text-xs font-bold text-mada-green underline">
                🚚 Suivi de livraison
              </Link>
            )}

            {/* Client confirm reception */}
            {role === "client" && !o.vendor_released && o.vendor_acceptance === "accepte" && (o.status === "expedie" || o.status === "livre" || o.status === "paye") && (
              <button
                onClick={async () => {
                  const { error } = await supabase.rpc("confirm_delivery" as any, { _order_id: o.id });
                  if (error) return toast.error(error.message);
                  toast.success("Merci ! Le vendeur sera payé ✅");
                  load();
                }}
                className="mt-2 ml-2 rounded-lg bg-mada-green px-3 py-1 text-xs font-bold text-secondary-foreground"
              >
                ✅ Produit reçu
              </button>
            )}
            {o.vendor_released && <div className="mt-1 text-[10px] font-bold text-mada-green">Fonds vendeur débloqués</div>}
            {role === "vendeur" && !o.vendor_released && o.auto_release_at && (
              <div className="mt-1 text-[10px] text-muted-foreground">Auto-libération: {new Date(o.auto_release_at).toLocaleDateString("fr-FR")}</div>
            )}
            {role === "client" && (o.status === "livre" || o.status === "annule" || o.status === "rembourse") && (
              <button
                onClick={async () => {
                  if (!confirm("Masquer cette commande de votre historique ?")) return;
                  const { error } = await supabase.from("orders").update({ client_hidden: true } as any).eq("id", o.id);
                  if (error) return toast.error(error.message);
                  toast.success("Commande masquée");
                  load();
                }}
                className="mt-2 ml-2 text-[10px] font-bold text-muted-foreground hover:text-destructive underline"
              >
                🗑️ Supprimer de l'historique
              </button>
            )}
          </div>
        </div>
      ))}

      {shipOrder && <ShippingModal order={shipOrder} onClose={() => setShipOrder(null)} onDone={load} />}
      {editOrder && <DeliveryEditModal order={editOrder} onClose={() => setEditOrder(null)} onDone={load} />}

    </div>
  );
}
