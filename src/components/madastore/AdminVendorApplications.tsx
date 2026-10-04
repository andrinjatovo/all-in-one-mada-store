import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { ChevronLeft, FileText, Search } from "lucide-react";

const STATUS: Record<string, string> = { brouillon: "Incomplet", soumis: "En attente", en_examen: "En examen", correction: "Correction", approuve: "Approuvé", refuse: "Refusé", suspendu: "Suspendu" };
const DOC_KEYS: [string, string][] = [["residence_cert", "Certificat de résidence"], ["id_front", "Pièce — recto"], ["id_back", "Pièce — verso"], ["face_photo", "Photo faciale"], ["existence_proof", "Preuve d'existence"], ["age_proof", "Justificatif d'ancienneté"], ["stock_photo", "Photo du stock"]];
const REFUSE_REASONS = ["Documents non authentiques", "Ancienneté insuffisante", "Stock insuffisant", "Informations incohérentes", "Boutique introuvable", "Autre"];

function months(d?: string) { if (!d) return 0; const a = new Date(d), n = new Date(); return (n.getFullYear() - a.getFullYear()) * 12 + n.getMonth() - a.getMonth(); }

export function AdminVendorApplications() {
  const [apps, setApps] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [region, setRegion] = useState("");
  const [open, setOpen] = useState<any | null>(null);

  async function load() {
    const { data } = await supabase.from("vendor_applications").select("*").order("updated_at", { ascending: false });
    setApps(data ?? []);
    if (open) setOpen((data ?? []).find((a: any) => a.id === open.id) ?? null);
  }
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { total: apps.length };
    for (const a of apps) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [apps]);
  const regions = [...new Set(apps.map((a) => a.data?.region).filter(Boolean))];
  const list = apps.filter((a) => {
    const d = a.data ?? {};
    const hay = [a.ref, d.full_name, d.email, d.phone, d.shop_name].join(" ").toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (!status || a.status === status) && (!region || d.region === region);
  });

  if (open) return <Detail app={open} onBack={() => setOpen(null)} onChanged={load} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["total", "Total"], ["soumis", "En attente"], ["brouillon", "Incomplets"], ["en_examen", "En examen"], ["approuve", "Approuvés"], ["refuse", "Refusés"], ["suspendu", "Suspendus"], ["correction", "Corrections"]].map(([k, l]) => (
          <button key={k} onClick={() => setStatus(k === "total" ? "" : k)} className={`rounded-xl border p-3 text-left ${status === k ? "border-mada-red" : "border-border"} bg-card`}>
            <div className="text-[10px] font-bold uppercase text-muted-foreground">{l}</div>
            <div className="text-xl font-black">{counts[k] ?? 0}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3">
          <Search className="h-4 w-4 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, email, téléphone, boutique, ID" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
        </div>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-xl border border-input bg-background px-2 text-sm">
          <option value="">Toutes régions</option>{regions.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      {list.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Aucune candidature.</p>}
      {list.map((a) => (
        <button key={a.id} onClick={() => setOpen(a)} className="flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 text-left">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{a.data?.shop_name || "Sans nom"} <span className="text-xs text-muted-foreground">· {a.ref}</span></div>
            <div className="truncate text-xs text-muted-foreground">{a.data?.full_name} · {a.data?.region ?? "—"} · {months(a.data?.shop_created_at)} mois · {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString("fr-FR") : "non soumis"}</div>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{STATUS[a.status]}</span>
        </button>
      ))}
    </div>
  );
}

function Detail({ app, onBack, onChanged }: { app: any; onBack: () => void; onChanged: () => void }) {
  const { user } = useAuth();
  const d = app.data ?? {};
  const [events, setEvents] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState(REFUSE_REASONS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("vendor_application_events").select("*").eq("application_id", app.id).order("created_at", { ascending: false }).then(({ data }) => setEvents(data ?? []));
  }, [app.id, app.status, app.exception_allowed]);

  async function view(path: string) {
    if (!user) return;
    await supabase.from("vendor_doc_access_log").insert({ application_id: app.id, admin_id: user.id, path });
    const { data, error } = await supabase.storage.from("vendor-docs").createSignedUrl(path, 300);
    if (error || !data) return toast.error("Lien indisponible");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function act(action: string, n = note, exception: boolean | null = null) {
    setBusy(true);
    const { error } = await supabase.rpc("admin_review_vendor_application", { _id: app.id, _action: action, _note: n, ...(exception !== null ? { _allow_exception: exception } : {}) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Décision enregistrée");
    setNote("");
    onChanged();
  }

  const rows: [string, any][] = [
    ["Nom", d.full_name], ["Téléphone", d.phone], ["Email", d.email], ["Naissance", d.birth_date],
    ["Boutique", d.shop_name], ["Type", d.shop_type], ["Activité", d.activity], ["Description", d.description],
    ["Création", d.shop_created_at ? `${d.shop_created_at} (${months(d.shop_created_at)} mois)` : ""],
    ["Catégories", d.categories], ["Références", d.nb_references], ["Qté moy./article", d.avg_qty_per_item], ["Lieu stock", d.stock_location], ["Réappro.", d.restock],
    ["Livreur", `${d.courier_name ?? ""} · ${d.courier_type ?? ""} · ${d.courier_zone ?? ""} · ${d.courier_phone ?? ""}`], ["Collaboration", d.courier_desc],
    ["Adresse", [d.lot, d.building, d.floor, d.quartier, d.fokontany, d.commune, d.district, d.region, d.province].filter(Boolean).join(", ")], ["Repère", d.landmark], ["Tél. pro", d.business_phone],
    ["GPS", d.gps ? `${d.gps.lat}, ${d.gps.lng}` : ""], ["Pièce", `${d.id_type ?? ""} · ${d.id_name ?? ""} · ${d.id_country ?? ""} · exp. ${d.id_expiry ?? "—"}`], ["Certificat émis", d.residence_date],
    ["Promotions", d.promo_ready ? "Disposé" : "Non précisé"],
  ];

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-bold"><ChevronLeft className="h-4 w-4" /> Candidatures</button>
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="text-lg font-black">{d.shop_name} <span className="text-xs text-muted-foreground">{app.ref}</span></h3>
        <p className="text-xs">Statut : <strong>{STATUS[app.status]}</strong>{app.exception_allowed && " · exception accordée"}</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {rows.map(([k, v]) => <div key={k} className="contents"><dt className="font-bold">{k}</dt><dd className="break-words">{v || "—"}</dd></div>)}
        </dl>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <h4 className="mb-2 text-sm font-black">Documents (liens temporaires 5 min, consultation journalisée)</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          {DOC_KEYS.filter(([k]) => d[k]).map(([k, l]) => <button key={k} onClick={() => view(d[k])} className="flex items-center gap-2 rounded-xl border border-border p-2 text-left text-xs"><FileText className="h-4 w-4" /> {l}</button>)}
          {(d.shop_photos ?? []).map((p: string, i: number) => <button key={p} onClick={() => view(p)} className="flex items-center gap-2 rounded-xl border border-border p-2 text-left text-xs"><FileText className="h-4 w-4" /> Photo boutique {i + 1}</button>)}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 text-xs">
        <h4 className="mb-2 text-sm font-black">Consentements</h4>
        {(d.consents ?? []).map((c: any) => <div key={c.key}>✓ {c.key} · v{c.version} · {new Date(c.accepted_at).toLocaleString("fr-FR")}</div>)}
      </div>
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h4 className="text-sm font-black">Décision</h4>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-xl border border-input bg-background px-2 py-2 text-sm">
          {REFUSE_REASONS.map((r) => <option key={r}>{r}</option>)}
        </select>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Explication / éléments à corriger" className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button disabled={busy} onClick={() => act("approuve")} className="rounded-xl bg-mada-green py-2 text-sm font-bold text-secondary-foreground">Approuver</button>
          <button disabled={busy} onClick={() => act("refuse", `${reason}${note ? " — " + note : ""}`)} className="rounded-xl border border-destructive py-2 text-sm font-bold text-destructive">Refuser</button>
          <button disabled={busy} onClick={() => act("correction")} className="rounded-xl border border-border py-2 text-sm font-bold">Demander correction</button>
          <button disabled={busy} onClick={() => act("en_examen")} className="rounded-xl border border-border py-2 text-sm font-bold">Mettre en examen</button>
          <button disabled={busy} onClick={() => act("suspendu", note || reason)} className="rounded-xl border border-destructive py-2 text-sm font-bold text-destructive">Suspendre</button>
          <button disabled={busy} onClick={() => act("exception", note || "Exception ancienneté/stock", !app.exception_allowed)} className="rounded-xl border border-border py-2 text-sm font-bold">{app.exception_allowed ? "Retirer exception" : "Accorder exception"}</button>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 text-xs">
        <h4 className="mb-2 text-sm font-black">Historique</h4>
        {events.map((e) => <div key={e.id} className="border-b border-border py-1">{new Date(e.created_at).toLocaleString("fr-FR")} · <strong>{e.action}</strong>{e.note && ` — ${e.note}`}</div>)}
      </div>
    </div>
  );
}

export function AdminVendorSettings() {
  const [s, setS] = useState<any>(null);
  const [hist, setHist] = useState<any[]>([]);
  async function load() {
    const [{ data }, { data: h }] = await Promise.all([
      supabase.from("app_settings").select("*").limit(1).maybeSingle(),
      supabase.from("exchange_rate_history").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    setS(data ? { ...data, pct: Number(data.commission_rate) * 100 } : null); setHist(h ?? []);
  }
  useEffect(() => { load(); }, []);
  if (!s) return null;
  async function save() {
    const { error } = await supabase.rpc("admin_update_vendor_settings", { _commission: Number(s.pct) / 100, _min_stock: Number(s.min_stock_per_item), _min_age: Number(s.min_shop_age_months), _usdt: Number(s.usdt_rate_mga) });
    if (error) return toast.error(error.message);
    toast.success("Paramètres enregistrés"); load();
  }
  const inp = (k: string, l: string) => (
    <label className="block text-xs font-bold">{l}<input type="number" value={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" /></label>
  );
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h4 className="text-sm font-black">Règles vendeurs</h4>
      <div className="grid grid-cols-2 gap-2">{inp("pct", "Commission (%)")}{inp("min_stock_per_item", "Stock min. / article")}{inp("min_shop_age_months", "Ancienneté min. (mois)")}{inp("usdt_rate_mga", "1 USDT en MGA")}</div>
      <button onClick={save} className="w-full rounded-xl bg-mada-red py-2 text-sm font-bold text-primary-foreground">Enregistrer</button>
      <div className="text-xs text-muted-foreground">Historique du taux : {hist.map((h) => `${Number(h.rate_mga)} (${new Date(h.created_at).toLocaleDateString("fr-FR")})`).join(" · ")}</div>
    </div>
  );
}
