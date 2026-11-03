import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps } from "@/lib/maps";
import { ProtectedShell } from "@/components/madastore/ProtectedShell";
import { formatMGA } from "@/components/madastore/Money";
import { Truck, MapPin, Package, Clock, Pencil, Save, X } from "lucide-react";
import { BackButton } from "@/components/madastore/BackButton";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/order/$id/tracking")({ component: TrackingPage });

type OrderDetail = {
  id: string;
  tracking_code: string | null;
  client_id: string;
  vendor_id: string;
  product_title: string;
  product_image: string | null;
  quantity: number;
  total_mga: number;
  status: string;
  tracking_status: string | null;
  shipping_mode: string | null;
  courier_name: string | null;
  coop_name: string | null;
  depart_city: string | null;
  depart_at: string | null;
  eta_at: string | null;
  delivery_days_min: number | null;
  delivery_days_max: number | null;
  shipped_at: string | null;
  addresses: any;
  vendor_profiles: any;
};

const STEPS = [
  { id: "prepare", label: "📦 Préparé", threshold: 0 },
  { id: "shipped", label: "🚚 Expédié", threshold: 0.01 },
  { id: "in_transit", label: "🛣️ En transit", threshold: 0.15 },
  { id: "arrived", label: "📍 Arrivé", threshold: 0.95 },
  { id: "delivered", label: "✅ Livré", threshold: 1 },
];

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TrackingPage() {
  const { role, user } = useAuth();
  const { id } = Route.useParams();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const truckMarkerRef = useRef<any>(null);
  const mapObjRef = useRef<any>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, tracking_code, client_id, vendor_id, product_title, product_image, quantity, total_mga, status, tracking_status, fulfillment_type, shipping_mode, courier_name, coop_name, depart_city, depart_at, eta_at, delivery_days_min, delivery_days_max, shipped_at, addresses(*), vendor_profiles!orders_vendor_id_fkey(shop_name, pickup_lat, pickup_lng, pickup_city)" as any,
      )
      .eq("id", id)
      .maybeSingle();
    if (error) setErr(error.message);
    else setOrder(data as any);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  // Realtime: refresh on any change to this order
  useEffect(() => {
    const ch = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [id]);

  // Per-second ticker
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Derived progress + countdown
  const { progress, remaining, depart, eta } = useMemo(() => {
    const depart = order?.depart_at ? new Date(order.depart_at).getTime() : null;
    const eta = order?.eta_at ? new Date(order.eta_at).getTime() : null;
    let progress = 0;
    if (order?.tracking_status === "delivered" || order?.status === "livre") progress = 1;
    else if (depart && eta && eta > depart) progress = Math.min(1, Math.max(0, (now - depart) / (eta - depart)));
    else if (order?.tracking_status === "shipped" || order?.tracking_status === "in_transit") progress = 0.1;
    const remaining = eta ? Math.max(0, eta - now) : 0;
    return { progress, remaining, depart, eta };
  }, [order, now]);

  // Auto-advance tracking_status based on time (any authenticated user with RLS access can update? — restrict to client or vendor)
  useEffect(() => {
    if (!order || !user) return;
    if (order.client_id !== user.id && order.vendor_id !== user.id) return;
    if (order.status === "livre" || order.tracking_status === "delivered") return;
    // Produit sur commande : la livraison doit être déclarée explicitement, jamais déduite du délai.
    if ((order as any).fulfillment_type === "sur_commande") return;
    const desired =
      progress >= 1 ? "delivered" :
      progress >= 0.95 ? "arrived" :
      progress > 0.15 ? "in_transit" :
      progress > 0 ? "shipped" : order.tracking_status;
    if (desired && desired !== order.tracking_status) {
      supabase.from("orders").update({ tracking_status: desired } as any).eq("id", order.id).then(() => {});
    }
  }, [progress, order, user]);

  // Countdown breakdown
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  // Map init
  useEffect(() => {
    if (!order || !mapRef.current) return;
    const v = order.vendor_profiles;
    const a = order.addresses;
    if (!v?.pickup_lat || !v?.pickup_lng || !a?.latitude || !a?.longitude) return;
    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !mapRef.current) return;
      const from = { lat: Number(v.pickup_lat), lng: Number(v.pickup_lng) };
      const to = { lat: Number(a.latitude), lng: Number(a.longitude) };
      const map = new google.maps.Map(mapRef.current, {
        center: from, zoom: 7, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      });
      mapObjRef.current = { google, from, to, map };
      new google.maps.Marker({ position: from, map, label: "A", title: "Départ" });
      new google.maps.Marker({ position: to, map, label: "B", title: "Destination" });
      new google.maps.Polyline({ path: [from, to], geodesic: true, strokeColor: "#FC3D32", strokeOpacity: 0.9, strokeWeight: 3, map });
      truckMarkerRef.current = new google.maps.Marker({
        position: from, map, title: "Colis",
        label: { text: "🚚", fontSize: "24px" },
      });
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(from); bounds.extend(to);
      map.fitBounds(bounds, 60);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [order?.id, order?.vendor_profiles?.pickup_lat, order?.addresses?.latitude]);

  // Update truck position each tick without re-init
  useEffect(() => {
    const ref = mapObjRef.current;
    if (!ref || !truckMarkerRef.current) return;
    const { from, to, google } = ref;
    const p = Math.min(1, Math.max(0, progress));
    const pos = new google.maps.LatLng(from.lat + (to.lat - from.lat) * p, from.lng + (to.lng - from.lng) * p);
    truckMarkerRef.current.setPosition(pos);
  }, [progress]);

  const isVendor = user && order && user.id === order.vendor_id;

  if (err) return <ProtectedShell expectedRole={(role ?? "client") as any} title="Suivi"><div className="p-4 text-destructive">{err}</div></ProtectedShell>;
  if (!order) return <ProtectedShell expectedRole={(role ?? "client") as any} title="Suivi"><div className="p-4">Chargement…</div></ProtectedShell>;

  const currentStep = order.tracking_status || "prepare";
  const stepIdx = STEPS.findIndex((s) => s.id === currentStep);
  const backLink = role === "vendeur" ? "/vendeur" : "/client";

  return (
    <ProtectedShell expectedRole={(role ?? "client") as any} title="Suivi de livraison">
      <div className="mb-3 flex items-center justify-between">
        <BackButton fallback={backLink} label="Retour" className="text-muted-foreground hover:text-foreground" />
        {isVendor && (
          <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1 rounded-lg bg-mada-green px-3 py-1.5 text-xs font-bold text-secondary-foreground">
            <Pencil className="h-3.5 w-3.5" /> Modifier planning
          </button>
        )}
      </div>

      <div className="space-y-4 pb-20">
        {order.tracking_code && (
          <button
            onClick={() => { navigator.clipboard?.writeText(order.tracking_code!); toast.success("Numéro copié"); }}
            className="w-full rounded-2xl border-2 border-dashed border-mada-green bg-mada-green/5 p-3 text-center"
          >
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Numéro de suivi</div>
            <div className="font-mono text-lg font-black text-mada-green">#{order.tracking_code}</div>
            <div className="text-[10px] text-muted-foreground">Cliquer pour copier</div>
          </button>
        )}

        {/* Product */}
        <div className="flex gap-3 rounded-2xl border border-border bg-card p-3">
          {order.product_image && <img src={order.product_image} alt="" className="h-16 w-16 rounded-xl object-cover" />}
          <div className="flex-1 min-w-0">
            <div className="line-clamp-2 text-sm font-bold">{order.product_title}</div>
            <div className="text-xs text-muted-foreground">Qté: {order.quantity}</div>
            <div className="text-sm font-black text-mada-red">{formatMGA(order.total_mga)}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between text-xs font-bold">
            <span>Progression en temps réel</span>
            <span className="text-mada-green tabular-nums">{(progress * 100).toFixed(1)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-mada-red to-mada-green transition-[width] duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
          </div>

          {/* Countdown */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            {[
              { v: days, l: "Jours" },
              { v: hours, l: "Heures" },
              { v: minutes, l: "Minutes" },
              { v: seconds, l: "Secondes" },
            ].map((x) => (
              <div key={x.l} className="rounded-xl bg-muted p-2">
                <div className="text-xl font-black tabular-nums text-mada-red">{String(x.v).padStart(2, "0")}</div>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">{x.l}</div>
              </div>
            ))}
          </div>
          {progress >= 1 && (
            <div className="mt-3 rounded-lg bg-mada-green/10 p-2 text-center text-xs font-black text-mada-green">
              🎉 Colis arrivé à destination
            </div>
          )}

          <div className="mt-4 grid grid-cols-5 gap-1 text-center">
            {STEPS.map((s, i) => (
              <div key={s.id} className={`text-[10px] ${i <= stepIdx ? "font-bold text-mada-green" : "text-muted-foreground"}`}>
                {s.label}
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div ref={mapRef} className="h-72 w-full bg-muted" />
        </div>

        {/* Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-card p-3 space-y-1 text-xs">
            <div className="font-black text-sm flex items-center gap-1"><Truck className="h-4 w-4 text-mada-green" /> Livraison</div>
            <div><b>Mode:</b> {order.shipping_mode ?? "—"}</div>
            <div><b>Livreur:</b> {order.courier_name ?? "—"}</div>
            {order.coop_name && <div><b>Coopérative:</b> {order.coop_name}</div>}
            <div><b>Départ:</b> {order.depart_city ?? order.vendor_profiles?.pickup_city ?? "—"} {depart && ` · ${new Date(depart).toLocaleString("fr-FR")}`}</div>
            {eta && <div><b>Arrivée estimée:</b> {new Date(eta).toLocaleString("fr-FR")}</div>}
            <div className="flex items-center gap-1 text-mada-red font-bold pt-1">
              <Clock className="h-3 w-3" />
              {progress >= 1 ? "Arrivé" : `${days}j ${hours}h ${minutes}m ${seconds}s restants`}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3 space-y-1 text-xs">
            <div className="font-black text-sm flex items-center gap-1"><MapPin className="h-4 w-4 text-mada-red" /> Destination</div>
            {order.addresses ? (
              <>
                <div className="font-bold">{order.addresses.full_name} · {order.addresses.phone}</div>
                <div>{[order.addresses.street, order.addresses.quartier, order.addresses.city, order.addresses.district, order.addresses.region, order.addresses.province].filter(Boolean).join(", ")}</div>
                {order.addresses.details && <div className="italic text-muted-foreground">{order.addresses.details}</div>}
              </>
            ) : <div className="text-muted-foreground">Adresse non renseignée</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 text-xs flex items-center gap-2">
          <Package className="h-4 w-4 text-mada-green" />
          <span>Statut colis: <b>{STEPS[stepIdx]?.label ?? "Préparé"}</b></span>
        </div>

        {/* Client action */}
        {role === "client" && progress >= 1 && order.status !== "livre" && (
          <button
            onClick={async () => {
              const { error } = await supabase.rpc("confirm_delivery" as any, { _order_id: order.id });
              if (error) return toast.error(error.message);
              toast.success("Merci ! Fonds libérés ✅");
              load();
            }}
            className="w-full rounded-xl bg-mada-green py-3 text-sm font-black text-secondary-foreground"
          >
            ✅ J'ai reçu mon colis
          </button>
        )}
      </div>

      {editOpen && isVendor && (
        <EditScheduleModal order={order} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); load(); }} />
      )}
    </ProtectedShell>
  );
}

function EditScheduleModal({ order, onClose, onSaved }: { order: OrderDetail; onClose: () => void; onSaved: () => void }) {
  const [depart, setDepart] = useState(toLocalInput(order.depart_at));
  const [dmin, setDmin] = useState(order.delivery_days_min ?? 2);
  const [dmax, setDmax] = useState(order.delivery_days_max ?? 5);
  const [mode, setMode] = useState(order.shipping_mode ?? "");
  const [courier, setCourier] = useState(order.courier_name ?? "");
  const [coop, setCoop] = useState(order.coop_name ?? "");
  const [city, setCity] = useState(order.depart_city ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!depart) return toast.error("Date de départ requise");
    setBusy(true);
    const { error } = await supabase.rpc("vendor_update_shipping" as any, {
      _order_id: order.id,
      _depart_at: new Date(depart).toISOString(),
      _days_min: dmin,
      _days_max: dmax,
      _mode: mode || null,
      _courier: courier || null,
      _coop: coop || null,
      _depart_city: city || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Planning mis à jour ⏱️");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[95vh] overflow-y-auto rounded-t-3xl md:rounded-3xl bg-card border border-border">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h3 className="font-black flex items-center gap-2"><Pencil className="h-5 w-5 text-mada-green" /> Modifier le planning</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-xs font-bold">Date & heure de départ</label>
            <input type="datetime-local" value={depart} onChange={(e) => setDepart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs">Délai min (j)</label>
              <input type="number" min={1} value={dmin} onChange={(e) => setDmin(+e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            <div><label className="text-xs">Délai max (j)</label>
              <input type="number" min={1} value={dmax} onChange={(e) => setDmax(+e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
          </div>
          <input value={mode} onChange={(e) => setMode(e.target.value)} placeholder="Mode (personnel, cooperative…)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Nom du livreur"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={coop} onChange={(e) => setCoop(e.target.value)} placeholder="Coopérative (optionnel)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville de départ"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          <div className="rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">
            L'arrivée estimée est recalculée automatiquement : départ + délai max.
          </div>
          <button onClick={save} disabled={busy}
            className="w-full rounded-xl bg-mada-green py-3 text-sm font-black text-secondary-foreground disabled:opacity-50 flex items-center justify-center gap-2">
            <Save className="h-4 w-4" /> {busy ? "..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
