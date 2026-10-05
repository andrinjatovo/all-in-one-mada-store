import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ProtectedShell } from "@/components/madastore/ProtectedShell";
import { TabNav } from "@/components/madastore/TabNav";
import { TicketsPanel } from "@/components/madastore/TicketsPanel";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatMGA } from "@/components/madastore/Money";
import { Store, Wallet, FileCheck, LifeBuoy, BarChart3, ArrowDownToLine, Truck } from "lucide-react";
import { AdminVendorApplications, AdminVendorSettings } from "@/components/madastore/AdminVendorApplications";
import { AdminWalletPanel } from "@/components/madastore/AdminWalletPanel";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const TABS = [
  { id: "stats", label: "Stats", icon: <BarChart3 className="h-5 w-5" /> },
  { id: "applications", label: "Dossiers", icon: <FileCheck className="h-5 w-5" /> },
  { id: "vendors", label: "Vendeurs", icon: <Store className="h-5 w-5" /> },
  { id: "deposits", label: "Dépôts", icon: <Wallet className="h-5 w-5" /> },
  { id: "wallet", label: "Wallet", icon: <ArrowDownToLine className="h-5 w-5" /> },
  { id: "logistics", label: "Livraison", icon: <Truck className="h-5 w-5" /> },
  { id: "tickets", label: "Tickets", icon: <LifeBuoy className="h-5 w-5" /> },
];

function AdminPage() {
  const [tab, setTab] = useState("stats");
  const { user } = useAuth();
  return (
    <ProtectedShell expectedRole="admin" title="Admin Console">
      <div className="mb-4 rounded-2xl bg-gradient-red p-5 text-primary-foreground shadow-glow-red">
        <h1 className="text-xl font-black">🔒 Console Administrateur</h1>
        <p className="text-xs opacity-90">Contrôle total de la plateforme ALL IN ONE MADA STORE</p>
      </div>
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-2 pb-2">
        {tab === "stats" && <Stats />}
        {tab === "applications" && <AdminVendorApplications />}
        {tab === "vendors" && <div className="space-y-3"><AdminVendorSettings /><VendorsManager /></div>}
        {tab === "deposits" && <DepositsManager />}
        {user && tab === "wallet" && <AdminWalletPanel userId={user.id} />}
        {tab === "logistics" && <LogisticsPanel />}
        {user && tab === "tickets" && <TicketsPanel userId={user.id} isAdmin />}
      </div>
    </ProtectedShell>
  );
}

function Stats() {
  const [s, setS] = useState({ vendors: 0, products: 0, orders: 0, deposits: 0, gmv: 0 });
  useEffect(() => {
    (async () => {
      const [v, p, o, d, gmv] = await Promise.all([
        supabase.from("vendor_profiles").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("deposits").select("id", { count: "exact", head: true }).eq("status", "en_attente"),
        supabase.from("orders").select("total_mga").eq("status", "paye"),
      ]);
      setS({
        vendors: v.count ?? 0,
        products: p.count ?? 0,
        orders: o.count ?? 0,
        deposits: d.count ?? 0,
        gmv: (gmv.data ?? []).reduce((a: number, x: any) => a + Number(x.total_mga), 0),
      });
    })();
  }, []);
  const cards = [
    { label: "Vendeurs", value: s.vendors, color: "from-mada-red to-pink-500" },
    { label: "Produits", value: s.products, color: "from-mada-green to-emerald-500" },
    { label: "Commandes", value: s.orders, color: "from-blue-500 to-indigo-600" },
    { label: "Dépôts en attente", value: s.deposits, color: "from-yellow-500 to-orange-500" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.color} p-4 text-white`}>
            <div className="text-xs font-bold uppercase opacity-90">{c.label}</div>
            <div className="mt-1 text-3xl font-black">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="text-xs font-bold uppercase text-muted-foreground">Volume d'affaires (commandes payées)</div>
        <div className="mt-2 text-3xl font-black text-mada-red">{formatMGA(s.gmv)}</div>
      </div>
    </div>
  );
}

function VendorsManager() {
  const [vs, setVs] = useState<any[]>([]);
  async function load() {
    const { data } = await supabase.from("vendor_profiles").select("*").order("created_at", { ascending: false });
    setVs(data ?? []);
  }
  useEffect(() => { load(); }, []);
  async function update(id: string, status: string) {
    const { error } = await supabase.from("vendor_profiles").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    load();
  }
  return (
    <div className="space-y-2">
      {vs.map((v) => (
        <div key={v.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3">
          <div>
            <div className="font-bold text-sm">{v.shop_name}</div>
            <div className="text-xs text-muted-foreground">{v.phone} · {v.status}</div>
          </div>
          <div className="flex gap-1">
            {v.status !== "actif" && <button onClick={() => update(v.id, "actif")} className="rounded-lg bg-mada-green px-3 py-1 text-xs font-bold text-secondary-foreground">Activer</button>}
            {v.status !== "rejete" && <button onClick={() => update(v.id, "rejete")} className="rounded-lg border border-destructive px-3 py-1 text-xs font-bold text-destructive">Rejeter</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DepositsManager() {
  const [deps, setDeps] = useState<any[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(100);
    setDeps(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function review(id: string, approve: boolean) {
    const { error } = await supabase.rpc("admin_validate_deposit", { _deposit_id: id, _approve: approve, _note: note[id] || undefined });
    if (error) return toast.error(error.message);
    toast.success(approve ? "Crédité ✅" : "Rejeté");
    load();
  }

  async function viewProof(path: string) {
    const { data } = await supabase.storage.from("proofs").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  return (
    <div className="space-y-3">
      {deps.length === 0 && <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Aucun dépôt.</div>}
      {deps.map((d) => (
        <div key={d.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-black text-lg text-mada-red">{formatMGA(d.amount_mga)}</div>
              <div className="text-xs text-muted-foreground">{d.method} · {d.reference ?? "Sans réf"} · {new Date(d.created_at).toLocaleString("fr-FR")}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${d.status === "valide" ? "bg-mada-green/15 text-mada-green" : d.status === "rejete" ? "bg-destructive/15 text-destructive" : "bg-yellow-100 text-yellow-800"}`}>{d.status}</span>
          </div>
          <button onClick={() => viewProof(d.proof_url)} className="text-xs font-bold text-mada-red underline">Voir la preuve</button>
          {d.status === "en_attente" && (
            <>
              <input value={note[d.id] ?? ""} onChange={(e) => setNote({ ...note, [d.id]: e.target.value })} placeholder="Note (optionnel)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs" />
              <div className="flex gap-2">
                <button onClick={() => review(d.id, true)} className="flex-1 rounded-xl bg-mada-green py-2 text-xs font-black text-secondary-foreground">Valider et créditer</button>
                <button onClick={() => review(d.id, false)} className="flex-1 rounded-xl border border-destructive py-2 text-xs font-black text-destructive">Rejeter</button>
              </div>
            </>
          )}
          {d.admin_note && <div className="rounded-lg bg-muted p-2 text-xs">Note: {d.admin_note}</div>}
        </div>
      ))}
    </div>
  );
}

function LogisticsPanel() {
  const [stats, setStats] = useState({ in_transit: 0, shipped: 0, delivered: 0, late: 0 });
  const [rows, setRows] = useState<any[]>([]);
  async function loadLogistics() {
    const { data } = await supabase
      .from("orders")
      .select("id, product_title, tracking_status, status, depart_at, eta_at, courier_name, shipping_mode, depart_city, total_mga, created_at" as any)
      .in("status", ["expedie", "livre"] as any)
      .order("created_at", { ascending: false })
      .limit(200);
    const list = (data ?? []) as any[];
    setRows(list);
    const now = Date.now();
    setStats({
      in_transit: list.filter((r) => r.tracking_status === "in_transit").length,
      shipped: list.filter((r) => r.tracking_status === "shipped").length,
      delivered: list.filter((r) => r.tracking_status === "delivered" || r.status === "livre").length,
      late: list.filter((r) => r.eta_at && new Date(r.eta_at).getTime() < now && r.status !== "livre" && r.tracking_status !== "delivered").length,
    });
  }
  useEffect(() => { loadLogistics(); }, []);
  // Realtime sync across client/vendeur/admin
  useEffect(() => {
    const ch = supabase
      .channel("admin-logistics-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadLogistics())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);
  const cards = [
    { label: "Expédiées", value: stats.shipped, color: "from-purple-500 to-indigo-500" },
    { label: "En transit", value: stats.in_transit, color: "from-blue-500 to-cyan-500" },
    { label: "Livrées", value: stats.delivered, color: "from-mada-green to-emerald-500" },
    { label: "En retard", value: stats.late, color: "from-mada-red to-orange-500" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-2xl bg-gradient-to-br ${c.color} p-4 text-white`}>
            <div className="text-xs font-bold uppercase opacity-90">{c.label}</div>
            <div className="mt-1 text-3xl font-black">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-black mb-3">Commandes en circulation</div>
        <div className="space-y-2">
          {rows.length === 0 && <div className="text-xs text-muted-foreground">Aucune commande en cours.</div>}
          {rows.slice(0, 50).map((r) => {
            const late = r.eta_at && new Date(r.eta_at).getTime() < Date.now() && r.status !== "livre";
            return (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{r.product_title}</div>
                  <div className="text-muted-foreground">{r.shipping_mode ?? "—"} · {r.courier_name ?? "—"} · {r.depart_city ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div>{r.tracking_status ?? "prepare"}</div>
                  {late && <div className="text-mada-red font-bold">⚠ Retard</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
