import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatMGA } from "./Money";
import { computePreorderSplit, type Availability, type PreorderInfo } from "@/lib/preorder";

export type AvailabilityValue = {
  availability: Availability | null;
  preorder: PreorderInfo;
  advance_percent: number;
};

export type MarketplaceRules = { commissionRate: number; maxAdvancePercent: number };

/** Commission et avance maximale fixées par l'admin (lecture seule). */
export function useMarketplaceRules(): MarketplaceRules {
  const [rules, setRules] = useState<MarketplaceRules>({ commissionRate: 0.1, maxAdvancePercent: 30 });
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("commission_rate,max_advance_percent")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRules({ commissionRate: Number(data.commission_rate) || 0, maxAdvancePercent: Number(data.max_advance_percent) || 0 });
      });
  }, []);
  return rules;
}

const field = "mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm";

export function ProductAvailabilityEditor({
  value, onChange, examplePrice, rules,
}: { value: AvailabilityValue; onChange: (v: AvailabilityValue) => void; examplePrice: number; rules: MarketplaceRules }) {
  const set = (patch: Partial<AvailabilityValue>) => onChange({ ...value, ...patch });
  const setPre = (patch: Partial<PreorderInfo>) => set({ preorder: { ...value.preorder, ...patch } });
  const price = examplePrice > 0 ? examplePrice : 100_000;
  const split = computePreorderSplit({
    itemsTotal: price, commissionRate: rules.commissionRate,
    advancePercent: value.advance_percent, maxAdvancePercent: rules.maxAdvancePercent,
  });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-border bg-background p-3 space-y-3">
      <div className="text-xs font-bold">Disponibilité du produit *</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => set({ availability: "disponible_localement", advance_percent: 0 })}
          className={`rounded-xl border-2 p-3 text-left transition-colors ${value.availability === "disponible_localement" ? "border-mada-green bg-mada-green/10" : "border-border"}`}
        >
          <div className="text-sm font-black">🇲🇬 Disponible à Madagascar</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Le produit est déjà disponible à Madagascar et peut être préparé pour expédition selon les délais de votre boutique.
          </p>
        </button>
        <button
          type="button"
          onClick={() => set({ availability: "sur_commande" })}
          className={`rounded-xl border-2 p-3 text-left transition-colors ${value.availability === "sur_commande" ? "border-mada-red bg-mada-red/10" : "border-border"}`}
        >
          <div className="text-sm font-black">🚢 Sur commande</div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ce produit doit être commandé ou approvisionné avant de pouvoir être livré au client.
          </p>
        </button>
      </div>

      {value.availability === "disponible_localement" && (
        <p className="text-[11px] text-muted-foreground">Indiquez ci-dessus le stock réellement disponible : les clients ne pourront pas commander au-delà.</p>
      )}

      {value.availability === "sur_commande" && (
        <div className="space-y-2 rounded-lg border border-mada-red/30 p-3">
          <div className="text-[11px] font-bold uppercase text-muted-foreground">Informations obligatoires</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] font-bold">Pays / lieu d'approvisionnement *
              <input value={value.preorder.origin_country ?? ""} onChange={(e) => setPre({ origin_country: e.target.value })} placeholder="ex. Chine" className={field} />
            </label>
            <label className="text-[11px] font-bold">Ville ou zone d'origine
              <input value={value.preorder.origin_city ?? ""} onChange={(e) => setPre({ origin_city: e.target.value })} placeholder="ex. Guangzhou" className={field} />
            </label>
            <label className="text-[11px] font-bold">Fournisseur / origine (facultatif)
              <input value={value.preorder.supplier ?? ""} onChange={(e) => setPre({ supplier: e.target.value })} className={field} />
            </label>
            <label className="text-[11px] font-bold">Date estimée de disponibilité *
              <input type="date" min={today} value={value.preorder.available_at ?? ""} onChange={(e) => setPre({ available_at: e.target.value })} className={field} />
            </label>
            <label className="text-[11px] font-bold">Délai d'arrivée à Madagascar (jours) *
              <input type="number" min={1} value={value.preorder.supply_days ?? ""} onChange={(e) => setPre({ supply_days: e.target.value })} className={field} />
            </label>
            <label className="text-[11px] font-bold">Préparation et expédition (jours) *
              <input type="number" min={0} value={value.preorder.prep_days ?? ""} onChange={(e) => setPre({ prep_days: e.target.value })} className={field} />
            </label>
            <label className="text-[11px] font-bold">Livraison au client (jours) *
              <input type="number" min={1} value={value.preorder.delivery_days ?? ""} onChange={(e) => setPre({ delivery_days: e.target.value })} className={field} />
            </label>
            <label className="text-[11px] font-bold">Avance vendeur (% du prix, max {rules.maxAdvancePercent} %) *
              <input
                type="number" min={0} max={rules.maxAdvancePercent} step={1}
                value={value.advance_percent}
                onChange={(e) => set({ advance_percent: Math.max(0, Number(e.target.value) || 0) })}
                className={field}
              />
            </label>
          </div>
          <label className="block text-[11px] font-bold">Conditions particulières
            <textarea value={value.preorder.conditions ?? ""} onChange={(e) => setPre({ conditions: e.target.value.slice(0, 500) })} rows={2} className={field} />
          </label>
          {value.advance_percent > rules.maxAdvancePercent && (
            <div className="rounded-md bg-destructive/10 px-2 py-1 text-[11px] font-bold text-destructive">
              L'avance dépasse le maximum autorisé ({rules.maxAdvancePercent} %). Réduisez-la ou demandez l'accord de l'administration.
            </div>
          )}
          <div className="rounded-md bg-muted p-2 text-[11px]">
            <div className="font-bold">Exemple pour {formatMGA(price)} (hors livraison)</div>
            <div>Payé par le client : <strong>{formatMGA(split.total)}</strong></div>
            <div>Avance versée à l'acceptation : <strong>{formatMGA(split.advance)}</strong></div>
            <div>Conservé par la plateforme jusqu'à la confirmation de réception : <strong>{formatMGA(split.protectedAmount)}</strong> (dont commission {formatMGA(split.commission)})</div>
          </div>
        </div>
      )}
    </div>
  );
}
