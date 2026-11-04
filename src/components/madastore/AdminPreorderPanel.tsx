import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatMGA } from "./Money";
import { formatDateFr, supplyLabel } from "@/lib/preorder";

type DisputeOrder = {
  id: string;
  product_title: string;
  total_mga: number;
  commission_mga: number;
  vendor_amount_mga: number;
  advance_mga: number;
  advance_released_mga: number;
  dispute_reason: string | null;
  dispute_opened_by: string | null;
  dispute_opened_at: string | null;
  client_id: string;
  vendor_id: string;
  supply_status: string | null;
  supply_eta: string | null;
  tracking_status: string | null;
};

/** Avance maximale autorisée + arbitrage des litiges « sur commande ». */
export function AdminPreorderPanel() {
  const [maxAdv, setMaxAdv] = useState<string>("");
  const [list, setList] = useState<DisputeOrder[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<{ tx: any[]; events: any[] }>({ tx: [], events: [] });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: s }, { data: o }] = await Promise.all([
      supabase.from("app_settings").select("max_advance_percent").eq("id", 1).maybeSingle(),
      supabase
        .from("orders")
        .select("id,product_title,total_mga,commission_mga,vendor_amount_mga,advance_mga,advance_released_mga,dispute_reason,dispute_opened_by,dispute_opened_at,client_id,vendor_id,supply_status,supply_eta,tracking_status")
        .eq("dispute_status", "ouvert")
        .order("dispute_opened_at", { ascending: true }),
    ]);
    if (s) setMaxAdv(String(Number(s.max_advance_percent)));
    setList((o ?? []) as DisputeOrder[]);
  }
  useEffect(() => { load(); }, []);

  async function saveMax() {
    const v = Number(maxAdv);
    const { error } = await supabase.rpc("admin_set_max_advance", { _pct: v });
    if (error) return toast.error(error.message);
    toast.success(`Avance maximale : ${v} %`);
    load();
  }

  async function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    const [{ data: tx }, { data: ev }] = await Promise.all([
      supabase.from("wallet_transactions").select("created_at,type,amount_mga,description").eq("reference_id", id).order("created_at"),
      supabase.from("order_events").select("created_at,field,old_value,new_value").eq("order_id", id).order("created_at"),
    ]);
    setDetails({ tx: tx ?? [], events: ev ?? [] });
  }

  async function resolve(o: DisputeOrder, decision: "liberer_vendeur" | "rembourser_client") {
    let claw = 0;
    if (decision === "rembourser_client" && o.advance_released_mga > 0) {
      const v = prompt(`Montant de l'avance à reprendre au vendeur (0 à ${o.advance_released_mga} Ar) :`, String(o.advance_released_mga));
      if (v === null) return;
      claw = Math.max(0, Math.min(o.advance_released_mga, Math.floor(Number(v) || 0)));
    }
    const note = prompt("Note de décision (visible par les deux parties) :") ?? undefined;
    if (!confirm(decision === "liberer_vendeur" ? "Verser le solde protégé au vendeur ?" : `Rembourser le client de ${formatMGA(o.total_mga - o.advance_released_mga + claw)} ?`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_resolve_order_dispute", { _order_id: o.id, _decision: decision, _clawback: claw, _note: note });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Litige clôturé");
    setOpen(null);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h4 className="text-sm font-black">Produits sur commande — avance vendeur maximale</h4>
        <p className="text-xs text-muted-foreground">Pourcentage maximum du prix des produits pouvant être versé au vendeur dès qu'il accepte une commande. Le reste est conservé jusqu'à la confirmation de réception.</p>
        <div className="flex gap-2">
          <input type="number" min={0} max={100} value={maxAdv} onChange={(e) => setMaxAdv(e.target.value)} className="w-28 rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          <span className="self-center text-sm">%</span>
          <button onClick={saveMax} className="rounded-xl bg-mada-red px-4 py-2 text-sm font-bold text-primary-foreground">Enregistrer</button>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h4 className="text-sm font-black">Litiges ouverts ({list.length})</h4>
        {list.length === 0 && <p className="text-xs text-muted-foreground">Aucun litige en cours.</p>}
        {list.map((o) => (
          <div key={o.id} className="space-y-2 rounded-xl border border-border p-3 text-xs">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold">{o.product_title}</div>
                <div className="text-muted-foreground">
                  Ouvert le {o.dispute_opened_at ? new Date(o.dispute_opened_at).toLocaleString("fr-FR") : "—"} par {o.dispute_opened_by === o.client_id ? "le client" : "le vendeur"}
                </div>
              </div>
              <button onClick={() => toggle(o.id)} className="rounded-lg border border-border px-2 py-1 font-bold">{open === o.id ? "Masquer" : "Historique"}</button>
            </div>
            <div className="rounded-md bg-destructive/10 px-2 py-1 text-destructive">{o.dispute_reason}</div>
            <div className="grid gap-x-3 sm:grid-cols-2">
              <div className="flex justify-between"><span>Total payé</span><strong>{formatMGA(o.total_mga)}</strong></div>
              <div className="flex justify-between"><span>Avance déjà versée</span><strong>{formatMGA(o.advance_released_mga)}</strong></div>
              <div className="flex justify-between"><span>Solde protégé</span><strong>{formatMGA(o.total_mga - o.advance_released_mga)}</strong></div>
              <div className="flex justify-between"><span>Commission</span><strong>{formatMGA(o.commission_mga)}</strong></div>
              <div className="flex justify-between"><span>Approvisionnement</span><strong>{supplyLabel(o.supply_status)}</strong></div>
              <div className="flex justify-between"><span>Estimation</span><strong>{formatDateFr(o.supply_eta)}</strong></div>
            </div>
            {open === o.id && (
              <div className="space-y-1 rounded-md bg-muted p-2">
                <div className="font-bold">Opérations financières</div>
                {details.tx.length === 0 && <div className="text-muted-foreground">Aucune opération.</div>}
                {details.tx.map((t, i) => (
                  <div key={i}>{new Date(t.created_at).toLocaleString("fr-FR")} · {t.type} · {formatMGA(Number(t.amount_mga))} — {t.description}</div>
                ))}
                <div className="pt-1 font-bold">Historique des statuts</div>
                {details.events.map((e, i) => (
                  <div key={i}>{new Date(e.created_at).toLocaleString("fr-FR")} · {e.field} : {e.old_value ?? "—"} → {e.new_value ?? "—"}</div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => resolve(o, "liberer_vendeur")} className="rounded-lg bg-mada-green px-3 py-1 font-bold text-secondary-foreground disabled:opacity-50">Verser le solde au vendeur</button>
              <button disabled={busy} onClick={() => resolve(o, "rembourser_client")} className="rounded-lg border border-destructive px-3 py-1 font-bold text-destructive disabled:opacity-50">Rembourser le client</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
