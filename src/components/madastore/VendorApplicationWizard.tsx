import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, uploadToBucket, humanizeDbError } from "@/lib/upload";
import { recordAcceptances } from "@/lib/legal-acceptance";
import { docVersion } from "@/lib/legal";
import { ChevronLeft, ChevronRight, Save, Upload, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

type Data = Record<string, any>;
type App = { id: string; ref: string; status: string; data: Data; correction_request: string | null; decision_reason: string | null; exception_allowed: boolean; submitted_at: string | null };
type Settings = { commission_rate: number; min_stock_per_item: number; min_shop_age_months: number; usdt_rate_mga: number; usdt_rate_updated_at: string; auto_release_days: number };

const FORM_VERSION = "1.0";
const STEPS = ["Informations personnelles", "Boutique", "Ancienneté", "Stock", "Livreur", "Conditions commerciales", "Adresse", "Pièce d'identité", "Photo faciale", "Photos boutique", "Consentements", "Vérification"];

const CONSENTS: { key: string; label: string; doc?: string }[] = [
  { key: "cgu", label: "J'accepte les Conditions générales d'utilisation", doc: "cgu" },
  { key: "vendeur", label: "J'accepte les Conditions spécifiques vendeur", doc: "vendeur" },
  { key: "commission", label: "J'accepte la commission de la plateforme sur chaque vente" },
  { key: "paiement", label: "J'accepte les règles de paiement et de retrait" },
  { key: "livraison", label: "J'accepte les règles de livraison", doc: "livraison" },
  { key: "promotions", label: "J'accepte les règles de réduction et de promotion" },
  { key: "confidentialite", label: "J'ai pris connaissance de la Politique de confidentialité", doc: "confidentialite" },
  { key: "documents", label: "J'accepte le traitement de mes documents pour la vérification" },
  { key: "exactitude", label: "Je certifie l'exactitude des informations fournies" },
  { key: "authenticite", label: "Je m'engage à fournir des documents authentiques" },
];

const REQUIRED_BY_STEP: Record<number, string[]> = {
  0: ["full_name", "phone", "email"],
  1: ["shop_name", "shop_type", "activity", "description"],
  2: ["shop_created_at"],
  3: ["categories", "nb_references", "avg_qty_per_item", "stock_location"],
  4: ["courier_name", "courier_type", "courier_zone", "courier_phone"],
  6: ["province", "region", "district", "commune", "fokontany", "quartier", "lot", "business_phone"],
  7: ["id_type", "id_name", "id_country", "id_front", "residence_cert"],
  8: ["face_photo"],
};

function monthsSince(date?: string) {
  if (!date) return 0;
  const d = new Date(date), n = new Date();
  return (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth()) - (n.getDate() < d.getDate() ? 1 : 0);
}

const STATUS_LABEL: Record<string, string> = { brouillon: "Brouillon", soumis: "Soumis", en_examen: "En cours d'examen", correction: "Informations complémentaires demandées", approuve: "Approuvé", refuse: "Refusé", suspendu: "Suspendu" };

export function VendorApplicationWizard({ userId, email }: { userId: string; email?: string }) {
  const [app, setApp] = useState<App | null>(null);
  const [data, setData] = useState<Data>({});
  const [settings, setSettings] = useState<Settings | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: a }, { data: s }] = await Promise.all([
      supabase.from("vendor_applications").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("app_settings").select("*").limit(1).maybeSingle(),
    ]);
    setSettings(s as any);
    if (a) { setApp(a as any); setData((a as any).data ?? {}); }
    else setData({ email: email ?? "" });
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId]);

  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));
  const editable = !app || app.status === "brouillon" || app.status === "correction";
  const minAge = settings?.min_shop_age_months ?? 12;
  const minStock = settings?.min_stock_per_item ?? 30;
  const age = monthsSince(data.shop_created_at);

  const missing = useMemo(() => {
    const m: { step: number; key: string }[] = [];
    for (const [s, keys] of Object.entries(REQUIRED_BY_STEP)) for (const k of keys) if (!String(data[k] ?? "").trim()) m.push({ step: Number(s), key: k });
    if (data.id_type === "cin" && !data.id_back) m.push({ step: 7, key: "id_back" });
    const photos = (data.shop_photos ?? []).length;
    if (photos < 2) m.push({ step: 9, key: "shop_photos (min 2)" });
    if ((data.consents ?? []).length < CONSENTS.length) m.push({ step: 10, key: "consentements" });
    return m;
  }, [data]);
  const blockers = [
    !app?.exception_allowed && data.shop_created_at && age < minAge ? `Ancienneté de ${age} mois (minimum ${minAge})` : null,
    !app?.exception_allowed && data.avg_qty_per_item && Number(data.avg_qty_per_item) < minStock ? `Stock moyen inférieur à ${minStock} unités par article` : null,
  ].filter(Boolean) as string[];

  async function save(silent = false) {
    setBusy(true);
    const payload = { ...data, form_version: FORM_VERSION };
    const res = app
      ? await supabase.from("vendor_applications").update({ data: payload }).eq("id", app.id).select("*").single()
      : await supabase.from("vendor_applications").insert({ user_id: userId, data: payload }).select("*").single();
    setBusy(false);
    if (res.error) { toast.error(humanizeDbError(res.error)); return false; }
    setApp(res.data as any);
    if (!silent) toast.success("Brouillon enregistré — vous pouvez continuer plus tard");
    return true;
  }

  async function go(n: number) {
    if (editable) await save(true);
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function upload(key: string, file: File | undefined, multiple = false) {
    if (!file) return;
    if (!/^image\/|application\/pdf/.test(file.type)) return toast.error("Format accepté : image ou PDF");
    if (file.size > 10 * 1024 * 1024) return toast.error("Fichier trop lourd (10 Mo max)");
    setBusy(true);
    try {
      const f = file.type.startsWith("image/") ? await compressImage(file) : file;
      const ext = f.type === "application/pdf" ? "pdf" : "jpg";
      const path = await uploadToBucket("vendor-docs", `${userId}/${key}-${Date.now()}.${ext}`, f);
      if (multiple) setData((d) => ({ ...d, [key]: [...(d[key] ?? []), path].slice(0, 4) }));
      else set(key, path);
      toast.success("Fichier envoyé");
    } catch (e) { toast.error(humanizeDbError(e)); }
    setBusy(false);
  }

  function toggleConsent(key: string) {
    const list: any[] = data.consents ?? [];
    const exists = list.find((c) => c.key === key);
    const c = CONSENTS.find((x) => x.key === key)!;
    set("consents", exists ? list.filter((x) => x.key !== key) : [...list, { key, version: c.doc ? docVersion(c.doc) : FORM_VERSION, form_version: FORM_VERSION, accepted_at: new Date().toISOString(), status: "accepte" }]);
  }

  async function submit() {
    if (missing.length || blockers.length) return toast.error("Dossier incomplet : vérifiez les éléments signalés");
    if (!(await save(true))) return;
    setBusy(true);
    const { data: ref, error } = await supabase.rpc("submit_vendor_application");
    setBusy(false);
    if (error) return toast.error(error.message);
    await recordAcceptances(userId, ["cgu", "vendeur", "livraison", "confidentialite"]);
    toast.success(`Candidature ${ref} envoyée`);
    load();
  }

  if (loading) return <div className="p-6 text-center text-sm text-muted-foreground">Chargement…</div>;

  if (app && !editable) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        {app.status === "refuse" || app.status === "suspendu" ? <AlertTriangle className="mx-auto h-10 w-10 text-destructive" /> : <Clock className="mx-auto h-10 w-10 text-mada-green" />}
        <h2 className="text-lg font-black">{STATUS_LABEL[app.status]}</h2>
        <p className="text-sm text-muted-foreground">Dossier <strong>{app.ref}</strong>{app.submitted_at && ` · soumis le ${new Date(app.submitted_at).toLocaleDateString("fr-FR")}`}</p>
        {(app.status === "soumis" || app.status === "en_examen") && (
          <p className="text-sm">Votre dossier sera examiné par l'administration. Le délai indicatif de traitement est de 24 à 72 heures. Ce délai peut varier selon les vérifications nécessaires.</p>
        )}
        {app.decision_reason && <p className="rounded-xl bg-muted p-3 text-sm">Motif : {app.decision_reason}</p>}
        <p className="text-xs text-muted-foreground">Avant approbation, la publication de produits, les ventes et les retraits sont désactivés.</p>
      </div>
    );
  }

  const field = (k: string, label: string, type = "text", extra: any = {}) => (
    <label className="block space-y-1">
      <span className="text-xs font-bold">{label}{Object.values(REQUIRED_BY_STEP).flat().includes(k) && <span className="text-mada-red"> *</span>}</span>
      {type === "textarea"
        ? <textarea value={data[k] ?? ""} onChange={(e) => set(k, e.target.value)} rows={3} maxLength={1500} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
        : <input type={type} value={data[k] ?? ""} onChange={(e) => set(k, e.target.value)} maxLength={200} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" {...extra} />}
    </label>
  );
  const select = (k: string, label: string, opts: [string, string][]) => (
    <label className="block space-y-1">
      <span className="text-xs font-bold">{label} <span className="text-mada-red">*</span></span>
      <select value={data[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm">
        <option value="">— Choisir —</option>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
  const fileField = (k: string, label: string, required = true) => (
    <div className="space-y-1">
      <span className="text-xs font-bold">{label}{required && <span className="text-mada-red"> *</span>}</span>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-border p-3 text-sm">
        {data[k] ? <CheckCircle2 className="h-5 w-5 text-mada-green" /> : <Upload className="h-5 w-5" />}
        <span className="truncate">{data[k] ? "Fichier reçu — toucher pour remplacer" : "Choisir un fichier (image ou PDF, 10 Mo max)"}</span>
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => upload(k, e.target.files?.[0])} />
      </label>
    </div>
  );

  const pct = settings ? Math.round(Number(settings.commission_rate) * 100) : 10;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-black">Devenir vendeur</h2>
        <p className="text-xs text-muted-foreground">Étape {step + 1}/{STEPS.length} · {STEPS[step]}{app && ` · Dossier ${app.ref}`}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-mada-green transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        {app?.status === "correction" && app.correction_request && (
          <div className="mt-3 rounded-xl border border-mada-red/40 bg-mada-red/5 p-3 text-sm"><strong>Correction demandée :</strong> {app.correction_request}</div>
        )}
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        {step === 0 && <>{field("full_name", "Nom complet")}{field("phone", "Téléphone", "tel")}{field("email", "Email", "email")}{field("birth_date", "Date de naissance", "date")}</>}
        {step === 1 && <>
          {field("shop_name", "Nom de la boutique")}
          {select("shop_type", "Type", [["boutique", "Boutique physique"], ["depot", "Dépôt / entrepôt"], ["mixte", "Boutique + dépôt"]])}
          {field("activity", "Activité principale")}
          {field("description", "Description de l'activité", "textarea")}
          {fileField("existence_proof", "Preuve d'existence (facultatif)", false)}
        </>}
        {step === 2 && <>
          {field("shop_created_at", "Date de création de la boutique", "date", { max: new Date().toISOString().slice(0, 10) })}
          {data.shop_created_at && <p className={`rounded-xl p-3 text-sm ${age >= minAge ? "bg-mada-green/10" : "bg-destructive/10 text-destructive"}`}>Ancienneté calculée : <strong>{age} mois</strong> (année de début {new Date(data.shop_created_at).getFullYear()}). {age < minAge && `Minimum requis : ${minAge} mois — envoi bloqué sauf exception accordée par l'administration.`}</p>}
          {fileField("age_proof", "Justificatif d'ancienneté (facultatif)", false)}
          <p className="text-xs text-muted-foreground">La date déclarée sera vérifiée par l'administration.</p>
        </>}
        {step === 3 && <>
          {field("categories", "Catégories de produits")}
          {field("nb_references", "Nombre de références différentes", "number", { min: 1 })}
          {field("avg_qty_per_item", "Quantité moyenne disponible par article (unités)", "number", { min: 0 })}
          {data.avg_qty_per_item && Number(data.avg_qty_per_item) < minStock && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">Minimum requis : {minStock} unités par article.</p>}
          {field("stock_location", "Lieu de stockage")}
          {select("restock", "Réapprovisionnement possible ?", [["oui", "Oui, régulier"], ["parfois", "Occasionnel"], ["non", "Non"]])}
          {fileField("stock_photo", "Photo du stock (facultatif)", false)}
        </>}
        {step === 4 && <>
          {field("courier_name", "Nom du livreur ou service")}
          {select("courier_type", "Type de livraison", [["moto", "Moto / coursier"], ["cooperative", "Coopérative / taxi-brousse"], ["societe", "Société de livraison"], ["propre", "Livreur propre"]])}
          {field("courier_zone", "Zone couverte")}
          {field("courier_phone", "Contact professionnel du livreur", "tel")}
          {field("courier_desc", "Description de la collaboration", "textarea")}
        </>}
        {step === 5 && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl bg-muted p-3"><strong>Commission :</strong> {pct} % par vente, calculée automatiquement. Chaque transaction affiche le montant brut, la commission et le net ; l'historique est disponible dans votre wallet.</div>
            <div className="rounded-xl bg-muted p-3"><strong>Paiement :</strong> après une vente, le montant net est placé « En attente ». Il devient disponible après confirmation de réception par le client ou au plus tard {settings?.auto_release_days ?? 10} jours après livraison, sauf litige. Les retraits peuvent être suspendus en cas de litige, fraude ou contrôle de sécurité.</div>
            <div className="rounded-xl bg-muted p-3"><strong>Promotions :</strong> réductions, coupons, promotions temporaires et campagnes sont soumis aux règles de la plateforme. Les coupons clients (1-5 %) sont déduits du prix de vente.</div>
            <div className="rounded-xl bg-muted p-3"><strong>Taux de change :</strong> devise de référence MGA. 1 USDT = {Number(settings?.usdt_rate_mga ?? 4500).toLocaleString("fr-FR")} MGA (mis à jour le {settings ? new Date(settings.usdt_rate_updated_at).toLocaleDateString("fr-FR") : "—"}). Les prix en USDT sont indicatifs ; les transactions sont réglées en MGA sans frais de conversion côté plateforme.</div>
            <label className="flex items-start gap-2"><input type="checkbox" checked={!!data.promo_ready} onChange={(e) => set("promo_ready", e.target.checked)} className="mt-1" /> Je suis disposé(e) à proposer des promotions occasionnelles.</label>
          </div>
        )}
        {step === 6 && <>
          <div className="grid gap-3 sm:grid-cols-2">
            {field("province", "Province")}{field("region", "Région")}{field("district", "District")}{field("commune", "Commune")}
            {field("fokontany", "Fokontany")}{field("quartier", "Quartier")}{field("lot", "Lot")}{field("building", "Bâtiment")}
            {field("floor", "Étage / boîte")}{field("business_phone", "Téléphone professionnel", "tel")}
          </div>
          {field("landmark", "Repère de localisation")}
          <button type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => { set("gps", { lat: p.coords.latitude, lng: p.coords.longitude }); toast.success("Position enregistrée"); }, () => toast.error("Position refusée"))} className="rounded-xl border border-border px-3 py-2 text-sm font-bold">📍 {data.gps ? `GPS : ${data.gps.lat.toFixed(5)}, ${data.gps.lng.toFixed(5)}` : "Ajouter ma position GPS (facultatif)"}</button>
          <p className="text-xs text-muted-foreground">Seuls le nom de la boutique, la région et la ville sont publics. L'adresse complète est réservée à l'administration et à la livraison.</p>
        </>}
        {step === 7 && <>
          {select("id_type", "Type de pièce", [["cin", "CIN (recto-verso)"], ["passeport", "Passeport"], ["permis", "Permis de conduire"]])}
          {field("id_name", "Nom indiqué sur la pièce")}
          {field("id_country", "Pays d'émission")}
          {field("id_expiry", "Date d'expiration", "date")}
          {fileField("id_front", "Recto")}
          {fileField("id_back", "Verso", data.id_type === "cin")}
          {fileField("residence_cert", "Certificat de résidence")}
          {field("residence_date", "Date d'émission du certificat", "date")}
        </>}
        {step === 8 && <>
          <div className="rounded-xl bg-muted p-3 text-xs space-y-1">
            <p><strong>Pourquoi ?</strong> Vérifier que la personne correspond à la pièce d'identité.</p>
            <p><strong>Qui la voit ?</strong> Uniquement les administrateurs autorisés, via des liens temporaires. Chaque consultation est journalisée.</p>
            <p><strong>Utilisation :</strong> comparaison manuelle par un administrateur. Aucune reconnaissance faciale automatique.</p>
            <p><strong>Conservation :</strong> durée du compte vendeur, puis suppression sur demande sauf obligation légale.</p>
            <p><strong>Sécurité :</strong> stockage privé, jamais public.</p>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-bold">Photo de votre visage <span className="text-mada-red">*</span></span>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-border p-3 text-sm">
              {data.face_photo ? <CheckCircle2 className="h-5 w-5 text-mada-green" /> : <Upload className="h-5 w-5" />}
              {data.face_photo ? "Photo reçue — toucher pour reprendre" : "Prendre / choisir une photo"}
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => upload("face_photo", e.target.files?.[0])} />
            </label>
          </div>
        </>}
        {step === 9 && <>
          <p className="text-sm">Ajoutez 2 à 4 photos : façade, entrée, intérieur, stockage, emplacement.</p>
          <div className="grid grid-cols-2 gap-2">
            {(data.shop_photos ?? []).map((p: string, i: number) => (
              <div key={p} className="flex items-center justify-between rounded-xl border border-border p-2 text-xs">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-mada-green" /> Photo {i + 1}</span>
                <button onClick={() => set("shop_photos", data.shop_photos.filter((x: string) => x !== p))} className="text-destructive">Retirer</button>
              </div>
            ))}
          </div>
          {(data.shop_photos ?? []).length < 4 && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-border p-3 text-sm">
              <Upload className="h-5 w-5" /> Ajouter une photo ({(data.shop_photos ?? []).length}/4)
              <input type="file" accept="image/*" className="hidden" onChange={(e) => upload("shop_photos", e.target.files?.[0], true)} />
            </label>
          )}
        </>}
        {step === 10 && (
          <div className="space-y-2">
            {CONSENTS.map((c) => (
              <label key={c.key} className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={!!(data.consents ?? []).find((x: any) => x.key === c.key)} onChange={() => toggleConsent(c.key)} />
                <span>{c.label}{c.key === "commission" && ` (${pct} %)`}{c.doc && <> — <Link to="/legal/$slug" params={{ slug: c.doc }} target="_blank" className="text-mada-red underline">lire</Link></>}</span>
              </label>
            ))}
          </div>
        )}
        {step === 11 && (
          <div className="space-y-3 text-sm">
            <h3 className="font-black">Récapitulatif</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {[["Nom", data.full_name], ["Téléphone", data.phone], ["Boutique", data.shop_name], ["Activité", data.activity], ["Ancienneté", data.shop_created_at ? `${age} mois` : ""], ["Stock moyen", data.avg_qty_per_item], ["Livreur", data.courier_name], ["Adresse", [data.lot, data.quartier, data.fokontany, data.commune, data.district, data.region, data.province].filter(Boolean).join(", ")], ["Pièce", data.id_type], ["Photos boutique", (data.shop_photos ?? []).length], ["Consentements", `${(data.consents ?? []).length}/${CONSENTS.length}`]].map(([k, v]) => (
                <div key={k as string} className="contents"><dt className="font-bold">{k}</dt><dd className="break-words">{v || <span className="text-destructive">manquant</span>}</dd></div>
              ))}
            </dl>
            {(missing.length > 0 || blockers.length > 0) && (
              <div className="rounded-xl bg-destructive/10 p-3 text-destructive">
                <strong>À compléter :</strong>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {blockers.map((b) => <li key={b}>{b}</li>)}
                  {missing.map((m) => <li key={m.key}><button className="underline" onClick={() => go(m.step)}>{STEPS[m.step]} : {m.key}</button></li>)}
                </ul>
              </div>
            )}
            <button disabled={busy || missing.length > 0 || blockers.length > 0} onClick={submit} className="w-full rounded-xl bg-mada-green py-3 font-black text-secondary-foreground disabled:opacity-50">SOUMETTRE MA CANDIDATURE</button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button disabled={step === 0 || busy} onClick={() => go(step - 1)} className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Retour</button>
        <button disabled={busy} onClick={() => save()} className="flex items-center gap-1 rounded-xl border border-border px-3 py-2 text-sm font-bold"><Save className="h-4 w-4" /> Brouillon</button>
        {step < STEPS.length - 1 && <button disabled={busy} onClick={() => go(step + 1)} className="flex items-center gap-1 rounded-xl bg-mada-red px-3 py-2 text-sm font-bold text-primary-foreground">Suivant <ChevronRight className="h-4 w-4" /></button>}
      </div>
    </div>
  );
}
