import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BackButton } from "@/components/madastore/BackButton";
import { formatMGA } from "@/components/madastore/Money";
import { Printer } from "lucide-react";

export const Route = createFileRoute("/order/$id/invoice")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Facture — ALL IN ONE MADA STORE" },
    { name: "description", content: "Facture de votre commande ALL IN ONE MADA STORE." },
    { property: "og:title", content: "Facture — ALL IN ONE MADA STORE" },
    { property: "og:description", content: "Facture de commande." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: InvoicePage,
});

const PENDING = "Informations à venir";
const TRACK: Record<string, string> = { prepare: "En préparation", prepared: "Colis préparé", shipped: "Départ", in_transit: "En route", nearby: "À proximité", at_depot: "En dépôt", arrived: "Arrivé", delivered: "Livré", cancelled: "Annulé" };
const STATUS: Record<string, string> = { en_attente: "En attente", paye: "Payée", expedie: "Expédiée", livre: "Livrée", annule: "Annulée", rembourse: "Remboursée" };
const dt = (v?: string | null) => (v ? new Date(v).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : PENDING);

function InvoicePage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth() as any;
  const [inv, setInv] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.rpc("get_order_invoice", { _order_id: id }).then(({ data, error }) => {
      if (error) setErr(error.message); else setInv(data);
    });
  }, [user, id]);

  if (!user) return <div className="p-8 text-center text-sm">{loading ? "Chargement…" : "Connectez-vous pour voir cette facture."}</div>;
  if (err) return <div className="mx-auto max-w-lg p-6 text-center"><BackButton fallback="/client" /><p className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm">{err}</p></div>;
  if (!inv) return <div className="p-8 text-center text-sm">Génération de la facture…</div>;

  const o = inv.order, c = inv.client ?? {}, a = inv.address ?? {}, v = inv.vendor ?? {};
  const normal = o.normal_unit_price_mga ?? o.unit_price_mga;
  const items = o.unit_price_mga * o.quantity;
  const discount = Math.max(0, (normal - o.unit_price_mga) * o.quantity);
  const number = `FAC-${String(o.id).slice(0, 8).toUpperCase()}`;
  const eta = o.eta_at ?? (o.depart_at && o.delivery_days_max ? null : null);
  const deliveryEvents = (inv.events ?? []).filter((e: any) => e.field !== "status");

  return (
    <div className="mx-auto max-w-3xl p-3 sm:p-6">
      <div className="mb-3 flex items-center justify-between print:hidden">
        <BackButton fallback="/client" />
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-mada-red px-4 py-2 text-sm font-bold text-primary-foreground"><Printer className="h-4 w-4" /> Télécharger la facture (PDF)</button>
      </div>
      <article className="space-y-5 rounded-2xl border border-border bg-card p-4 text-sm sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div>
            <div className="text-xl font-black">ALL IN ONE MADA STORE 🇲🇬</div>
            <div className="text-xs text-muted-foreground">all.in.one.mada.store@gmail.com · 037 63 244 15</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-black">FACTURE</div>
            <div className="font-mono text-xs">{number}</div>
            <div className="text-xs">Commande n° {String(o.id).slice(0, 8).toUpperCase()}{o.tracking_code && ` · suivi #${o.tracking_code}`}</div>
            <div className="text-xs">Commandée le {dt(o.created_at)}</div>
            <div className="text-xs">Acceptée le {dt(o.vendor_decided_at)}</div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-1 text-xs font-black uppercase text-muted-foreground">Client</h2>
            <div className="font-bold">{a.full_name || c.full_name || PENDING}</div>
            <div>{a.phone || c.phone || "—"}</div>
            {c.email && <div className="break-all">{c.email}</div>}
            <div className="mt-1 text-xs">
              {a.id ? <>
                {[a.street, a.details].filter(Boolean).join(" — ")}<br />
                Quartier / zone : {a.quartier ?? "—"}<br />
                District / ville : {[a.district, a.city].filter(Boolean).join(" / ") || "—"}<br />
                Région : {a.region ?? "—"} · Province : {a.province ?? "—"}
              </> : o.shipping_address}
            </div>
          </div>
          <div>
            <h2 className="mb-1 text-xs font-black uppercase text-muted-foreground">Vendeur</h2>
            <div className="font-bold">{v.shop_name ?? "—"}</div>
            <div>{v.phone || "—"}</div>
            <div className="text-xs">{[v.pickup_quartier, v.pickup_city, v.pickup_region, v.pickup_province].filter(Boolean).join(", ") || v.address || PENDING}</div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-black uppercase text-muted-foreground">Produits</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-xs">
              <thead><tr className="border-b border-border text-left"><th className="py-1">Produit</th><th>Variante</th><th className="text-right">Qté</th><th className="text-right">Prix unitaire</th><th className="text-right">Montant</th></tr></thead>
              <tbody>
                <tr className="border-b border-border align-top">
                  <td className="py-2"><div className="flex items-center gap-2">{o.product_image && <img src={o.product_image} alt="" className="h-10 w-10 rounded object-cover" />}<span className="font-bold">{o.product_title}</span></div></td>
                  <td>{o.variant_label || "—"}</td>
                  <td className="text-right">{o.quantity}</td>
                  <td className="text-right">{formatMGA(o.unit_price_mga)}{normal !== o.unit_price_mga && <div className="line-through opacity-60">{formatMGA(normal)}</div>}</td>
                  <td className="text-right font-bold">{formatMGA(items)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <dl className="ml-auto mt-3 max-w-xs space-y-1 text-xs">
            {discount > 0 && <div className="flex justify-between"><dt>Réduction {o.negotiated_offer_id ? "(prix négocié)" : ""}</dt><dd>-{formatMGA(discount)}</dd></div>}
            {o.coupon_percent && <div className="flex justify-between"><dt>Coupon</dt><dd>-{o.coupon_percent} %</dd></div>}
            <div className="flex justify-between"><dt>Sous-total</dt><dd>{formatMGA(items)}</dd></div>
            <div className="flex justify-between"><dt>Frais de livraison</dt><dd>{formatMGA(o.delivery_fee_mga ?? 0)}</dd></div>
            <div className="flex justify-between border-t border-border pt-1 text-sm font-black"><dt>Total payé</dt><dd className="text-mada-red">{formatMGA(o.total_mga)}</dd></div>
            <div className="flex justify-between"><dt>Mode de paiement</dt><dd>{o.payment_method}</dd></div>
            <div className="flex justify-between"><dt>Statut</dt><dd>{STATUS[o.status] ?? o.status} · acceptée</dd></div>
          </dl>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-black uppercase text-muted-foreground">Livraison</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt>Boutique d'origine</dt><dd>{v.shop_name ?? "—"}</dd>
            <dt>Lieu de départ</dt><dd>{o.depart_city || v.pickup_city || PENDING}</dd>
            <dt>Livreur</dt><dd>{o.courier_name || o.coop_name || "En attente d'attribution"}</dd>
            <dt>Mode de livraison</dt><dd>{o.shipping_mode || PENDING}</dd>
            <dt>Départ</dt><dd>{dt(o.depart_at)}</dd>
            <dt>Arrivée estimée</dt><dd>{eta ? dt(eta) : o.delivery_days_min && o.delivery_days_max ? `${o.delivery_days_min} à ${o.delivery_days_max} jours après le départ` : PENDING}</dd>
            <dt>Statut livraison</dt><dd>{TRACK[o.tracking_status] ?? o.tracking_status ?? PENDING}</dd>
            <dt>Destination</dt><dd>{[a.quartier, a.city ?? a.district, a.region].filter(Boolean).join(", ") || o.shipping_address || "—"}</dd>
            <dt>Frais de livraison</dt><dd>{formatMGA(o.delivery_fee_mga ?? 0)}</dd>
          </dl>
        </section>

        {deliveryEvents.length > 0 && (
          <section className="print:hidden">
            <h2 className="mb-2 text-xs font-black uppercase text-muted-foreground">Historique des mises à jour</h2>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {deliveryEvents.map((e: any) => <li key={e.id}>{new Date(e.created_at).toLocaleString("fr-FR")} — {e.field} : {e.old_value ?? "—"} → {e.new_value ?? "—"}</li>)}
            </ul>
          </section>
        )}
        <footer className="border-t border-border pt-3 text-[10px] text-muted-foreground">Facture générée le {new Date().toLocaleString("fr-FR")} à partir des données de la commande. ALL IN ONE MADA STORE agit en tant que marketplace ; le produit est vendu par la boutique indiquée.</footer>
      </article>
    </div>
  );
}
