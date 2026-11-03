import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMGA } from "./Money";
import { SUPPLY_STEPS, formatDateFr, supplyLabel, totalPreorderDays } from "@/lib/preorder";

export type PreorderOrder = {
  id: string;
  total_mga: number;
  commission_mga?: number;
  delivery_fee_mga?: number | null;
  vendor_amount_mga?: number;
  status: string;
  vendor_acceptance?: string;
  vendor_released?: boolean;
  tracking_status?: string | null;
  fulfillment_type?: string;
  advance_mga?: number;
  advance_released_mga?: number;
  advance_released_at?: string | null;
  preorder_snapshot?: any;
  supply_status?: string | null;
  supply_eta?: string | null;
  supply_history?: any;
  dispute_status?: string | null;
  dispute_reason?: string | null;
  dispute_resolution?: string | null;
  refunded_mga?: number;
};

const SHIPPED = ["shipped", "in_transit", "nearby", "at_depot", "delivered"];

/** Suivi d'une commande « sur commande » : répartition du paiement, approvisionnement, réception, annulation, litige. */
export function PreorderOrderPanel({ o, role, onChange }: { o: PreorderOrder; role: "client" | "vendeur"; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const history: any[] = Array.isArray(o.supply_history) ? o.supply_history : [];
  const advance = Number(o.advance_mga ?? 0);
  const released = Number(o.advance_released_mga ?? 0);
  const protectedAmount = o.total_mga - released;
  const closed = !!o.vendor_released || o.status === "rembourse" || o.status === "annule";
  const delivered = o.tracking_status === "delivered" || o.status === "livre";
  const shipped = SHIPPED.includes(o.tracking_status ?? "");
  const disputeOpen = o.dispute_status === "ouvert";
  const today = new Date().toISOString().slice(0, 10);
  const late = !!o.supply_eta && o.supply_eta < today && !delivered && !closed;
  const currentIdx = SUPPLY_STEPS.findIndex((s) => s.id === o.supply_status);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(ok);
    onChange();
  }

  const supply = (status: string | null, eta: string | null, note?: string) =>
    run(() => supabase.rpc("vendor_update_supply", { _order_id: o.id, _status: status ?? undefined, _eta: eta ?? undefined, _note: note }), "Suivi mis à jour");

  function changeEta() {
    const v = prompt("Nouvelle date estimée (AAAA-MM-JJ) :", o.supply_eta ?? today);
    if (!v) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return toast.error("Format attendu : AAAA-MM-JJ");
    const note = prompt("Motif du changement (facultatif) :") ?? undefined;
    supply(null, v, note);
  }

  function openDispute() {
    const r = prompt("Décrivez le problème (non-réception, produit non conforme, retard…) :");
    if (!r) return;
    run(() => supabase.rpc("open_order_dispute", { _order_id: o.id, _reason: r }), "Litige ouvert : l'administration va examiner la commande");
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-mada-red/30 bg-mada-red/5 p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-1">
        <span className="rounded-full bg-mada-red px-2 py-0.5 text-[10px] font-black text-primary-foreground">🚢 Sur commande</span>
        {o.supply_eta && <span className={`rounded-full px-2 py-0.5 font-bold ${late ? "bg-destructive/15 text-destructive" : "bg-muted"}`}>📅 Estimation : {formatDateFr(o.supply_eta)}{late && " — date dépassée, mise à jour attendue"}</span>}
        {o.preorder_snapshot && <span className="text-muted-foreground">≈ {totalPreorderDays(o.preorder_snapshot)} j depuis {o.preorder_snapshot.origin_country}</span>}
      </div>

      <div className="grid gap-x-3 sm:grid-cols-2">
        <div className="flex justify-between"><span>Total payé par le client</span><strong>{formatMGA(o.total_mga)}</strong></div>
        <div className="flex justify-between"><span>Avance vendeur {released > 0 ? "(versée)" : "(à l'acceptation)"}</span><strong>{formatMGA(released > 0 ? released : advance)}</strong></div>
        <div className="flex justify-between"><span>{closed ? "Montant protégé (clôturé)" : "Conservé par la plateforme"}</span><strong>{formatMGA(closed ? 0 : protectedAmount)}</strong></div>
        {role === "vendeur" && <div className="flex justify-between"><span>Commission plateforme</span><strong>{formatMGA(Number(o.commission_mga ?? 0))}</strong></div>}
        {Number(o.refunded_mga ?? 0) > 0 && <div className="flex justify-between text-mada-green"><span>Remboursé au client</span><strong>{formatMGA(Number(o.refunded_mga))}</strong></div>}
      </div>

      {history.length > 0 && (
        <ol className="space-y-0.5 border-l-2 border-mada-red/40 pl-2">
          {history.map((h, i) => (
            <li key={i}>
              <strong>{supplyLabel(h.status)}</strong> · {new Date(h.at).toLocaleString("fr-FR")}
              {h.eta && <> · estimation {formatDateFr(h.eta)}</>}
              {h.note && h.status !== "avance_versee" && <span className="text-muted-foreground"> — {h.note}</span>}
            </li>
          ))}
        </ol>
      )}

      {disputeOpen && <div className="rounded-md bg-destructive/10 px-2 py-1 font-bold text-destructive">⚠️ Litige en cours — paiement du solde bloqué. Motif : {o.dispute_reason}</div>}
      {o.dispute_status === "resolu" && o.dispute_resolution && <div className="rounded-md bg-muted px-2 py-1">⚖️ Litige clôturé : {o.dispute_resolution}</div>}

      {/* Vendeur */}
      {role === "vendeur" && o.vendor_acceptance === "accepte" && !closed && (
        <div className="flex flex-wrap gap-1">
          {!shipped && SUPPLY_STEPS.map((s, i) => (
            <button
              key={s.id}
              disabled={busy || i < currentIdx}
              onClick={() => supply(s.id, null)}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-bold disabled:opacity-40 ${o.supply_status === s.id ? "border-mada-red bg-mada-red text-primary-foreground" : "border-border bg-card"}`}
            >
              {s.label}
            </button>
          ))}
          {!delivered && <button disabled={busy} onClick={changeEta} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-bold">📅 Modifier la date estimée</button>}
          {!shipped && (
            <button
              disabled={busy}
              onClick={() => {
                const r = prompt("Motif de l'annulation (le client sera remboursé intégralement, votre avance sera reprise) :");
                if (r) run(() => supabase.rpc("vendor_cancel_preorder", { _order_id: o.id, _reason: r }), "Commande annulée, client remboursé");
              }}
              className="rounded-full border border-destructive px-2 py-0.5 text-[10px] font-bold text-destructive"
            >
              ❌ Annuler et rembourser
            </button>
          )}
          {!disputeOpen && <button disabled={busy} onClick={openDispute} className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-bold">⚖️ Ouvrir un litige</button>}
        </div>
      )}
      {role === "vendeur" && o.vendor_acceptance === "accepte" && !closed && !["arrive_madagascar", "pret_expedition"].includes(o.supply_status ?? "") && (
        <div className="text-muted-foreground">L'expédition sera possible après « Produit arrivé à Madagascar » ou « Prêt à être expédié ».</div>
      )}

      {/* Client */}
      {role === "client" && o.vendor_acceptance === "en_attente" && !closed && (
        <button
          disabled={busy}
          onClick={() => {
            if (!confirm("Annuler cette commande ? Le montant total sera remboursé sur votre wallet.")) return;
            run(() => supabase.rpc("client_cancel_order", { _order_id: o.id }), "Commande annulée et remboursée");
          }}
          className="rounded-lg border border-destructive px-3 py-1 text-xs font-bold text-destructive"
        >
          Annuler la commande
        </button>
      )}
      {role === "client" && o.vendor_acceptance === "accepte" && !closed && (
        <div className="flex flex-wrap gap-2">
          {delivered && !disputeOpen ? (
            <button
              disabled={busy}
              onClick={() => {
                if (!confirm("Confirmez-vous avoir reçu le produit en bon état ? Le solde sera versé au vendeur.")) return;
                run(() => supabase.rpc("confirm_delivery", { _order_id: o.id }), "Réception confirmée ✅ Le vendeur reçoit le solde.");
              }}
              className="rounded-lg bg-mada-green px-3 py-1 text-xs font-bold text-secondary-foreground"
            >
              ✅ Confirmer la réception du produit
            </button>
          ) : (
            !disputeOpen && <span className="text-muted-foreground">Le bouton de confirmation apparaîtra lorsque le vendeur aura déclaré la livraison.</span>
          )}
          {!disputeOpen && <button disabled={busy} onClick={openDispute} className="rounded-lg border border-border px-3 py-1 text-xs font-bold">⚖️ Signaler un problème</button>}
        </div>
      )}
    </div>
  );
}
