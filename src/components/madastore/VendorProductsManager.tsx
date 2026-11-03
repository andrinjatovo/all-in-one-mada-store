import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatMGA, formatUSDT } from "./Money";
import { Plus, Trash2, X, Heart, MessageCircle, Video as VideoIcon, Pencil, Save, Search, BadgePercent, HardDrive, Cloud, Sparkles, Link2, Unlink } from "lucide-react";
import { assertSession, compressImage, uploadToBucket, humanizeDbError, logStep } from "@/lib/upload";
import {
  uploadProductImage,
  connectGoogleDrive,
  driveStatus,
  unlinkGoogleDrive,
  getStoredProvider,
  setStoredProvider,
  type StorageProvider,
} from "@/lib/drive-upload";
import { analyzeProductWithAI, type ProductAISuggestion } from "@/lib/api/product-ai.functions";
import { ProductAvailabilityEditor, useMarketplaceRules, type AvailabilityValue } from "./ProductAvailabilityEditor";
import { validatePreorder } from "@/lib/preorder";

type Attributes = { product_type?: string; material?: string; subcategory?: string; keywords?: string[] };

function emptyAvailability(): AvailabilityValue {
  return { availability: null, preorder: {}, advance_percent: 0 };
}

/** Somme des stocks par variante si renseignés, sinon null (stock global). */
function variantStockTotal(vars: { stock?: number }[]): number | null {
  const withStock = vars.filter((v) => typeof v.stock === "number" && !Number.isNaN(v.stock));
  if (withStock.length === 0) return null;
  return withStock.reduce((s, v) => s + Math.max(0, Number(v.stock) || 0), 0);
}

function minPositive(list: number[]): number {
  const v = list.filter((n) => n > 0);
  return v.length ? Math.min(...v) : 0;
}

function availabilityError(a: AvailabilityValue, stock: number, maxAdvance: number): string | null {
  if (!a.availability) return "Choisissez la disponibilité du produit (Disponible à Madagascar ou Sur commande)";
  if (a.availability === "disponible_localement" && stock <= 0) return "Indiquez le stock réellement disponible à Madagascar";
  if (a.availability === "sur_commande") {
    if (stock <= 0) return "Indiquez la quantité maximale que vous pouvez fournir sur commande (stock)";
    return validatePreorder(a.preorder, a.advance_percent, maxAdvance);
  }
  return null;
}

function AttributesEditor({ value, onChange }: { value: Attributes; onChange: (v: Attributes) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="text-[11px] font-bold">Type de produit
        <input value={value.product_type ?? ""} onChange={(e) => onChange({ ...value, product_type: e.target.value.slice(0, 60) })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
      </label>
      <label className="text-[11px] font-bold">Matière
        <input value={value.material ?? ""} onChange={(e) => onChange({ ...value, material: e.target.value.slice(0, 60) })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
      </label>
      <label className="text-[11px] font-bold">Sous-catégorie
        <input value={value.subcategory ?? ""} onChange={(e) => onChange({ ...value, subcategory: e.target.value.slice(0, 60) })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
      </label>
      <label className="text-[11px] font-bold sm:col-span-3">Mots-clés de recherche (séparés par des virgules)
        <input
          value={(value.keywords ?? []).join(", ")}
          onChange={(e) => onChange({ ...value, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean).slice(0, 10) })}
          className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
        />
      </label>
    </div>
  );
}



const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 10;
const MAX_IMG_MB = 15;
const MAX_VIDEO_MB = 50;

const COLOR_PRESETS = ["Noir", "Blanc", "Rouge", "Bleu", "Vert", "Jaune", "Rose", "Gris", "Marron", "Beige"];
const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOE_PRESETS = ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"];
const UNIT_PRESETS = [
  "unité", "pièce", "paire", "boîte", "plaquette", "sachet", "lot", "paquet",
  "g", "kg", "mL", "L",
  "cm", "m", "m²", "m³", "pouce",
  "Ah", "W", "V",
];

// Validation rules (CHARACTERS, not words)
const TITLE_MIN = 15;
const TITLE_MAX = 30;
const DESC_MIN = 60;
const DESC_MAX = 360;

function validateTitle(t: string): string | null {
  const n = t.trim().length;
  if (n < TITLE_MIN) return `Titre trop court (${n}/${TITLE_MIN} caractères)`;
  if (n > TITLE_MAX) return `Titre trop long (${n}/${TITLE_MAX} caractères)`;
  return null;
}
function validateDesc(d: string): string | null {
  const n = d.trim().length;
  if (n < DESC_MIN) return `Description trop courte (${n}/${DESC_MIN} caractères)`;
  if (n > DESC_MAX) return `Description trop longue (${n}/${DESC_MAX} caractères)`;
  return null;
}

type Variant = { price_mga: number; colors: string[]; sizes: string[]; units: string[]; custom?: string; stock?: number };
type ImageEntry = { file: File; preview: string; variant: Variant };

type Product = {
  id: string;
  title: string;
  description: string | null;
  price_mga: number;
  stock: number;
  images: string[];
  is_active: boolean;
  category_id: string | null;
  video_url: string | null;
  variants: any;
  unit: string | null;
  availability?: string;
  preorder?: any;
  advance_percent?: number;
  attributes?: any;
};
type Category = { id: string; name: string };

function emptyVariant(): Variant {
  return { price_mga: 0, colors: [], sizes: [], units: [] };
}

// ────────────────────────────────────────────────────────────
// Reusable Variant editor (per image)
// ────────────────────────────────────────────────────────────
function VariantEditor({
  index, variant, onChange, onRemove,
}: { index: number; variant: Variant; onChange: (v: Variant) => void; onRemove?: () => void }) {
  function toggle(key: "colors" | "sizes" | "units", value: string) {
    const cur = variant[key];
    onChange({ ...variant, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  }
  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-bold">Variante #{index + 1}</div>
        {onRemove && <button onClick={onRemove} className="rounded p-1 text-destructive hover:bg-destructive/10"><X className="h-3 w-3" /></button>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-bold uppercase">Prix (MGA) *</label>
          <input type="number" value={variant.price_mga || ""} onChange={(ev) => onChange({ ...variant, price_mga: Number(ev.target.value) })} placeholder="ex. 45000" className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm" />
          {variant.price_mga > 0 && <div className="mt-1 text-[10px] text-muted-foreground">≈ {formatUSDT(variant.price_mga)}</div>}
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase">Stock de la variante</label>
          <input
            type="number" min={0}
            value={variant.stock ?? ""}
            onChange={(ev) => onChange({ ...variant, stock: ev.target.value === "" ? undefined : Math.max(0, Number(ev.target.value)) })}
            placeholder="facultatif"
            className="w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase mb-1">Couleurs</div>
        <div className="flex flex-wrap gap-1">
          {COLOR_PRESETS.map((c) => (
            <button key={c} type="button" onClick={() => toggle("colors", c)} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${variant.colors.includes(c) ? "border-mada-red bg-mada-red text-primary-foreground" : "border-border"}`}>{c}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase mb-1">Tailles / pointures</div>
        <div className="flex flex-wrap gap-1">
          {[...SIZE_PRESETS, ...SHOE_PRESETS].map((s) => (
            <button key={s} type="button" onClick={() => toggle("sizes", s)} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${variant.sizes.includes(s) ? "border-mada-green bg-mada-green text-secondary-foreground" : "border-border"}`}>{s}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase mb-1">Unités (kg, L, m², W, V, Ah…)</div>
        <div className="flex flex-wrap gap-1">
          {UNIT_PRESETS.map((u) => (
            <button key={u} type="button" onClick={() => toggle("units", u)} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${variant.units.includes(u) ? "border-mada-red bg-mada-red text-primary-foreground" : "border-border"}`}>{u}</button>
          ))}
        </div>
        <input
          value={variant.custom || ""}
          onChange={(e) => onChange({ ...variant, custom: e.target.value })}
          placeholder="Autre (saisie libre) : ex. 200mg, 5A, 12kWh…"
          className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1 text-[11px]"
        />
      </div>
    </div>
  );
}

export function VendorProductsManager({ vendorId, vendorActive }: { vendorId: string; vendorActive: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [stock, setStock] = useState("1");
  const [category, setCategory] = useState<string>("");
  const [entries, setEntries] = useState<ImageEntry[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [engagement, setEngagement] = useState<Record<string, { likes: number; comments: number }>>({});
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [promoFor, setPromoFor] = useState<Product | null>(null);
  const [provider, setProvider] = useState<StorageProvider>("supabase");
  const [drive, setDrive] = useState<{ connected: boolean; email: string | null }>({ connected: false, email: null });
  const [driveBusy, setDriveBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<ProductAISuggestion | null>(null);
  const [avail, setAvail] = useState<AvailabilityValue>(emptyAvailability());
  const [attrs, setAttrs] = useState<Attributes>({});
  const rules = useMarketplaceRules();
  const variantTotal = variantStockTotal(entries.map((e) => e.variant));
  const effectiveStock = variantTotal ?? (Number(stock) || 0);

  useEffect(() => {
    setProvider(getStoredProvider());
    driveStatus().then(setDrive).catch(() => {});
  }, []);

  async function chooseProvider(p: StorageProvider) {
    if (p === "drive" && !drive.connected) {
      await linkDrive();
      return;
    }
    setProvider(p);
    setStoredProvider(p);
  }

  async function linkDrive() {
    setDriveBusy(true);
    try {
      await connectGoogleDrive();
      const s = await driveStatus();
      setDrive(s);
      if (s.connected) {
        setProvider("drive");
        setStoredProvider("drive");
        toast.success("Google Drive connecté ✅");
      } else {
        toast.error("Connexion non finalisée.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Connexion Google Drive impossible");
    } finally {
      setDriveBusy(false);
    }
  }

  async function unlinkDrive() {
    setDriveBusy(true);
    try {
      await unlinkGoogleDrive();
      setDrive({ connected: false, email: null });
      setProvider("supabase");
      setStoredProvider("supabase");
      toast.success("Google Drive déconnecté");
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setDriveBusy(false);
    }
  }

  async function analyzeWithAI() {
    const first = entries[0];
    if (!first) return toast.error("Ajoutez d'abord une image du produit.");
    setAiBusy(true);
    toast.loading("Analyse IA en cours…", { id: "ai" });
    try {
      const compressed = await compressImage(first.file);
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result ?? "");
          resolve(s.slice(s.indexOf(",") + 1));
        };
        r.onerror = () => reject(new Error("Lecture image impossible"));
        r.readAsDataURL(compressed);
      });
      const { suggestion, error } = await analyzeProductWithAI({
        data: {
          imageBase64: base64,
          mimeType: compressed.type || "image/jpeg",
          currentTitle: title,
          categories: cats.map((c) => ({ id: c.id, name: c.name })),
        },
      });
      if (!suggestion) throw new Error(error ?? "Analyse impossible");
      setAiResult(suggestion);
      setTitle(suggestion.title.slice(0, TITLE_MAX));
      setDesc(suggestion.description.slice(0, DESC_MAX));
      if (suggestion.category_id) setCategory(suggestion.category_id);
      setAttrs((a) => ({
        product_type: suggestion.product_type || a.product_type,
        material: suggestion.material || a.material,
        subcategory: suggestion.subcategory || a.subcategory,
        keywords: suggestion.keywords?.length ? suggestion.keywords : a.keywords,
      }));
      // Seule l'unité suggérée est préremplie ; couleurs/tailles restent à confirmer par le vendeur.
      if (suggestion.suggested_unit) {
        setEntries((list) =>
          list.map((e, i) =>
            i === 0 && e.variant.units.length === 0 ? { ...e, variant: { ...e.variant, units: [suggestion.suggested_unit] } } : e,
          ),
        );
      }
      toast.success(
        suggestion.confidence === "faible" ? "Analyse terminée avec des doutes : vérifiez la fiche ⚠️" : "Fiche préremplie par l'IA ✨ — vérifiez avant de publier",
        { id: "ai" },
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur IA", { id: "ai" });
    } finally {
      setAiBusy(false);
    }
  }




  const titleErr = useMemo(() => (title ? validateTitle(title) : null), [title]);
  const descErr = useMemo(() => (desc ? validateDesc(desc) : null), [desc]);

  async function load() {
    const [p, c] = await Promise.all([
      supabase.from("products").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false }),
      supabase.from("categories").select("id, name"),
    ]);
    const prods = ((p.data ?? []) as any[]) as Product[];
    setProducts(prods);
    setCats((c.data ?? []) as Category[]);
    if (c.data?.[0] && !category) setCategory(c.data[0].id);

    if (prods.length) {
      const ids = prods.map((x) => x.id);
      const [{ data: likes }, { data: comments }] = await Promise.all([
        supabase.from("product_likes").select("product_id").in("product_id", ids),
        supabase.from("product_comments").select("product_id").in("product_id", ids),
      ]);
      const map: Record<string, { likes: number; comments: number }> = {};
      ids.forEach((id) => (map[id] = { likes: 0, comments: 0 }));
      (likes ?? []).forEach((l: any) => map[l.product_id] && map[l.product_id].likes++);
      (comments ?? []).forEach((c: any) => map[c.product_id] && map[c.product_id].comments++);
      setEngagement(map);
    }
  }
  useEffect(() => {
    load();
    const ch = supabase
      .channel(`vendor-products-${vendorId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `vendor_id=eq.${vendorId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const arr = Array.from(files);
    const ok: ImageEntry[] = [];
    for (const f of arr) {
      if (entries.length + ok.length >= MAX_IMAGES) { toast.error(`Max ${MAX_IMAGES} images`); break; }
      if (!ALLOWED_TYPES.includes(f.type)) { toast.error(`${f.name}: format non supporté`); continue; }
      if (f.size > MAX_IMG_MB * 1024 * 1024) { toast.error(`${f.name}: > ${MAX_IMG_MB} Mo`); continue; }
      ok.push({ file: f, preview: URL.createObjectURL(f), variant: emptyVariant() });
    }
    setEntries((e) => [...e, ...ok]);
  }

  function setVariant(i: number, v: Variant) {
    setEntries((e) => e.map((x, idx) => (idx === i ? { ...x, variant: v } : x)));
  }
  function removeEntry(i: number) { setEntries((e) => e.filter((_, idx) => idx !== i)); }

  function applySuggested(key: "colors" | "sizes") {
    const vals = aiResult?.[key] ?? [];
    if (!vals.length) return;
    setEntries((list) => list.map((e, i) => (i === 0 ? { ...e, variant: { ...e.variant, [key]: Array.from(new Set([...e.variant[key], ...vals])) } } : e)));
    toast.success(key === "colors" ? "Couleurs ajoutées à la variante #1" : "Tailles ajoutées à la variante #1");
  }

  async function create() {
    const tErr = validateTitle(title);
    const dErr = validateDesc(desc);
    if (tErr) return toast.error(tErr);
    if (dErr) return toast.error(dErr);
    if (!category) return toast.error("Choisissez une catégorie");
    if (entries.length === 0) return toast.error("Au moins une image");
    if (entries.some((e) => !e.variant.price_mga || e.variant.price_mga <= 0))
      return toast.error("Prix obligatoire pour chaque image/variante");
    const aErr = availabilityError(avail, effectiveStock, rules.maxAdvancePercent);
    if (aErr) return toast.error(aErr);

    setSaving(true);
    try {
      logStep("publication démarrée", { images: entries.length, vendorId });
      await assertSession();

      const urls: string[] = [];
      const variants: any[] = [];
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        toast.loading(
          `Envoi image ${i + 1}/${entries.length} vers ${provider === "drive" ? "Google Drive" : "le stockage interne"}…`,
          { id: "pub" },
        );
        urls.push(await uploadProductImage(provider, e.file, vendorId, i));
        variants.push({ image_index: i, ...e.variant });
      }


      let video_url: string | null = null;
      if (video) {
        if (video.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`Vidéo > ${MAX_VIDEO_MB} Mo`);
        const ext = (video.name.split(".").pop() || "mp4").toLowerCase();
        const vpath = `${vendorId}/video-${Date.now()}.${ext}`;
        toast.loading("Envoi de la vidéo…", { id: "pub" });
        video_url = await uploadToBucket("products", vpath, video);
      }

      const minPrice = Math.min(...variants.map((v) => v.price_mga));
      // Aggregate units across variants for legacy `unit` column (first found or 'unité')
      const firstUnit = variants.flatMap((v: any) => v.units || [])[0] || "unité";

      toast.loading("Enregistrement du produit…", { id: "pub" });
      logStep("insertion produit", { title, images: urls.length, variants: variants.length });
      const { error } = await supabase.from("products").insert({
        vendor_id: vendorId,
        category_id: category || null,
        title, description: desc,
        price_mga: minPrice,
        stock: effectiveStock,
        images: urls,
        video_url,
        variants,
        unit: firstUnit,
        availability: avail.availability,
        preorder: avail.availability === "sur_commande" ? avail.preorder : {},
        advance_percent: avail.availability === "sur_commande" ? avail.advance_percent : 0,
        attributes: attrs,
      } as any);
      if (error) throw new Error(error.message?.startsWith("Sur commande") || error.message?.startsWith("Avance") ? error.message : humanizeDbError(error));
      logStep("publication terminée ✅");
      toast.success("Produit publié ✅", { id: "pub" });
      setShowForm(false);
      setTitle(""); setDesc(""); setStock("1"); setEntries([]); setVideo(null);
      setAvail(emptyAvailability()); setAttrs({}); setAiResult(null);
      load();
    } catch (e: any) {
      console.error("[publish] échec", e);
      toast.error(e?.message ?? "Erreur", { id: "pub" });
    } finally {
      setSaving(false);
    }
  }


  async function remove(id: string) {
    if (!confirm("Supprimer ce produit ?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Supprimé");
    load();
  }

  async function toggle(p: Product) {
    await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  }

  if (!vendorActive) {
    return (
      <div className="rounded-2xl border-2 border-mada-red/30 bg-mada-red/5 p-6 text-center">
        <h3 className="font-bold text-mada-red">Compte non activé</h3>
        <p className="mt-2 text-sm text-muted-foreground">Vous pourrez publier dès l'activation par l'admin.</p>
      </div>
    );
  }

  const titleLen = title.trim().length;
  const descLen = desc.trim().length;

  return (
    <div className="space-y-4">
      <button onClick={() => setShowForm((v) => !v)} className="inline-flex items-center gap-2 rounded-xl bg-mada-red px-4 py-2 text-sm font-bold text-primary-foreground">
        {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        {showForm ? "Fermer" : "Ajouter un produit"}
      </button>

      {showForm && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX + 20} placeholder={`Titre (${TITLE_MIN}–${TITLE_MAX} caractères)`} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className={`mt-1 text-[10px] ${titleErr ? "text-destructive" : title ? "text-mada-green" : "text-muted-foreground"}`}>
              {titleErr ?? (title ? `✓ ${titleLen}/${TITLE_MAX} caractères` : `${TITLE_MIN}–${TITLE_MAX} caractères requis`)}
            </div>
          </div>
          <div>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={DESC_MAX + 40} placeholder={`Description (${DESC_MIN}–${DESC_MAX} caractères)`} rows={5} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className={`mt-1 text-[10px] ${descErr ? "text-destructive" : desc ? "text-mada-green" : "text-muted-foreground"}`}>
              {descErr ?? (desc ? `✓ ${descLen}/${DESC_MAX} caractères` : `${DESC_MIN}–${DESC_MAX} caractères requis`)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] font-bold">Stock total
              <input
                type="number" min={0}
                value={variantTotal ?? stock}
                disabled={variantTotal !== null}
                onChange={(e) => setStock(e.target.value)}
                placeholder="Stock"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-70"
              />
              {variantTotal !== null && <span className="text-[10px] font-normal text-muted-foreground">Somme des stocks par variante</span>}
            </label>
            <label className="text-[11px] font-bold">Catégorie
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <AttributesEditor value={attrs} onChange={setAttrs} />
          <ProductAvailabilityEditor
            value={avail}
            onChange={setAvail}
            rules={rules}
            examplePrice={minPositive(entries.map((e) => e.variant.price_mga))}
          />

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="text-xs font-bold">Stockage des images</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => chooseProvider("supabase")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${provider === "supabase" ? "border-mada-red bg-mada-red/10 text-mada-red" : "border-border text-muted-foreground"}`}
              >
                <Cloud className="h-4 w-4" /> Stockage interne
              </button>
              <button
                type="button"
                onClick={() => chooseProvider("drive")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${provider === "drive" ? "border-mada-red bg-mada-red/10 text-mada-red" : "border-border text-muted-foreground"}`}
              >
                <HardDrive className="h-4 w-4" /> Google Drive
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
              {drive.connected ? (
                <>
                  <span className="text-mada-green">✓ Drive connecté{drive.email ? ` · ${drive.email}` : ""}</span>
                  <button
                    type="button"
                    disabled={driveBusy}
                    onClick={unlinkDrive}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-semibold disabled:opacity-50"
                  >
                    <Unlink className="h-3 w-3" /> Déconnecter
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={driveBusy}
                  onClick={linkDrive}
                  className="inline-flex items-center gap-1 rounded-md bg-foreground/10 px-2 py-1 font-semibold disabled:opacity-50"
                >
                  <Link2 className="h-3 w-3" /> {driveBusy ? "Connexion…" : "Connecter mon Google Drive"}
                </button>
              )}
              <span>Dossier automatique : ALL IN ONE MADA STORE / Produits.</span>
            </div>
          </div>

          <div>
            <label className="block">
              <span className="text-xs font-bold">Images (max {MAX_IMAGES}, {MAX_IMG_MB} Mo, JPG/PNG/WEBP)</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addFiles(e.target.files)} className="mt-1 block w-full text-xs" />
            </label>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Chaque image devient une variante avec ses propres couleurs, tailles et unités (kg, L, m², W, V, Ah…).
            </div>
            <button
              type="button"
              disabled={aiBusy || entries.length === 0}
              onClick={analyzeWithAI}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-mada-green px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" /> {aiBusy ? "Analyse…" : "Analyser avec IA"}
            </button>
            {aiResult && (
              <div className="mt-2 space-y-2 rounded-xl border border-mada-green/40 bg-mada-green/5 p-3 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-black">✨ Suggestions IA — à vérifier</span>
                  <span className={`rounded-full px-2 py-0.5 font-bold ${aiResult.confidence === "haute" ? "bg-mada-green/20 text-mada-green" : aiResult.confidence === "moyenne" ? "bg-muted" : "bg-destructive/15 text-destructive"}`}>
                    Confiance : {aiResult.confidence}
                  </span>
                </div>
                {aiResult.warnings.length > 0 && (
                  <ul className="list-disc space-y-0.5 rounded-lg bg-destructive/10 py-1.5 pl-5 pr-2 text-destructive">
                    {aiResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                )}
                <div className="text-muted-foreground">
                  Unité suggérée : <strong className="text-foreground">{aiResult.suggested_unit || "—"}</strong>
                  {aiResult.category_name && <> · Catégorie : <strong className="text-foreground">{aiResult.category_name}</strong></>}
                </div>
                {aiResult.colors.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span>Couleurs visibles :</span>
                    {aiResult.colors.map((c) => <span key={c} className="rounded-full border border-border px-2 py-0.5">{c}</span>)}
                    <button type="button" onClick={() => applySuggested("colors")} className="rounded-full bg-mada-red px-2 py-0.5 font-bold text-primary-foreground">Appliquer</button>
                  </div>
                )}
                {aiResult.sizes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span>Tailles possibles :</span>
                    {aiResult.sizes.map((s) => <span key={s} className="rounded-full border border-border px-2 py-0.5">{s}</span>)}
                    <button type="button" onClick={() => applySuggested("sizes")} className="rounded-full bg-mada-red px-2 py-0.5 font-bold text-primary-foreground">Appliquer</button>
                  </div>
                )}
                <p className="text-muted-foreground">Le produit n'est jamais publié automatiquement : corrigez si besoin puis cliquez sur « Publier le produit ».</p>
              </div>
            )}
          </div>


          {entries.length > 0 && (
            <div className="space-y-3">
              {entries.map((e, i) => (
                <div key={i} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex gap-3">
                    <img src={e.preview} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
                    <VariantEditor index={i} variant={e.variant} onChange={(v) => setVariant(i, v)} onRemove={() => removeEntry(i)} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <label className="block rounded-lg border border-dashed border-border p-3">
            <span className="flex items-center gap-2 text-xs font-bold"><VideoIcon className="h-4 w-4" /> Vidéo (optionnel, max {MAX_VIDEO_MB} Mo)</span>
            <input type="file" accept="video/*" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
            {video && <div className="mt-1 text-[10px] text-muted-foreground">{video.name} · {(video.size / 1024 / 1024).toFixed(1)} Mo</div>}
          </label>

          <button
            onClick={create}
            disabled={saving || !!titleErr || !!descErr || !title || !desc}
            className="w-full rounded-xl bg-mada-green py-2.5 text-sm font-black text-secondary-foreground disabled:opacity-50"
          >
            {saving ? "Publication..." : "Publier le produit"}
          </button>
        </div>
      )}

      {products.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans mes produits..."
            className="w-full rounded-full border-2 border-border bg-card pl-10 pr-3 py-2 text-sm outline-none focus:border-mada-red"
          />
        </div>
      )}

      {products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Aucun produit.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {products
            .filter((p) => !search.trim() || p.title.toLowerCase().includes(search.trim().toLowerCase()))
            .map((p) => {

            const eng = engagement[p.id] ?? { likes: 0, comments: 0 };
            return (
              <div key={p.id} className={`overflow-hidden rounded-2xl border border-border bg-card ${!p.is_active && "opacity-60"}`}>
                <div className="aspect-square bg-muted relative">
                  {p.images?.[0] && <img src={p.images[0]} alt="" className="h-full w-full object-cover" />}
                  {p.video_url && <span className="absolute top-2 left-2 rounded-full bg-black/60 p-1 text-white"><VideoIcon className="h-3 w-3" /></span>}
                </div>
                <div className="p-3 space-y-1">
                  <div className="line-clamp-1 text-xs font-bold">{p.title}</div>
                  {(p as any).discount_percent > 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-black text-mada-red">
                        {formatMGA(Math.floor((p.price_mga * (100 - (p as any).discount_percent)) / 100))}
                      </span>
                      <span className="text-[10px] text-muted-foreground line-through">{formatMGA(p.price_mga)}</span>
                      <span className="rounded-full bg-mada-green px-1.5 text-[9px] font-black text-secondary-foreground">
                        -{(p as any).discount_percent}%
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm font-black text-mada-red">{formatMGA(p.price_mga)}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground">≈ {formatUSDT(p.price_mga)}</div>
                  <div className="text-[10px] text-muted-foreground">Stock: {p.stock} {p.unit || "unité"}</div>
                  <div className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black ${p.availability === "sur_commande" ? "bg-mada-red/15 text-mada-red" : "bg-mada-green/15 text-mada-green"}`}>
                    {p.availability === "sur_commande" ? "🚢 Sur commande" : "🇲🇬 Disponible à Madagascar"}
                  </div>
                  <div className="flex items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" /> {eng.likes}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {eng.comments}</span>
                  </div>
                  <div className="flex gap-1 pt-1">
                    <button onClick={() => setEditing(p)} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1 text-[10px] font-bold"><Pencil className="h-3 w-3" /> Éditer</button>
                    <button onClick={() => toggle(p)} className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold">{p.is_active ? "Cacher" : "Activer"}</button>
                    <button onClick={() => remove(p.id)} className="rounded-lg border border-destructive p-1 text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  <button
                    onClick={() => setPromoFor(p)}
                    className="mt-1 w-full inline-flex items-center justify-center gap-1 rounded-lg bg-mada-green px-2 py-1 text-[10px] font-black text-secondary-foreground"
                  >
                    <BadgePercent className="h-3 w-3" /> Créer une promo
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditProductModal
          product={editing}
          categories={cats}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {promoFor && (
        <PromoModal
          product={promoFor}
          onClose={() => setPromoFor(null)}
          onSaved={() => { setPromoFor(null); load(); }}
        />
      )}

    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Edit modal — full product update including per-image variants
// ────────────────────────────────────────────────────────────
function EditProductModal({
  product, categories, onClose, onSaved,
}: { product: Product; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(product.title);
  const [desc, setDesc] = useState(product.description || "");
  const [stock, setStock] = useState(String(product.stock));
  const [category, setCategory] = useState(product.category_id || "");
  const [images, setImages] = useState<string[]>(product.images || []);
  const [newFiles, setNewFiles] = useState<{ file: File; preview: string }[]>([]);
  const [variants, setVariants] = useState<Variant[]>(() => {
    const raw = Array.isArray(product.variants) ? product.variants : [];
    const list: Variant[] = (product.images || []).map((_url, i) => {
      const found = raw.find((v: any) => v.image_index === i);
      return {
        price_mga: Number(found?.price_mga) || product.price_mga || 0,
        colors: Array.isArray(found?.colors) ? found.colors : [],
        sizes: Array.isArray(found?.sizes) ? found.sizes : [],
        units: Array.isArray(found?.units) ? found.units : (product.unit ? [product.unit] : []),
        custom: found?.custom || "",
        stock: typeof found?.stock === "number" ? found.stock : undefined,
      };
    });
    return list;
  });
  const [saving, setSaving] = useState(false);
  const [avail, setAvail] = useState<AvailabilityValue>({
    availability: (product.availability as AvailabilityValue["availability"]) ?? "disponible_localement",
    preorder: product.preorder && typeof product.preorder === "object" ? product.preorder : {},
    advance_percent: Number(product.advance_percent ?? 0),
  });
  const [attrs, setAttrs] = useState<Attributes>(product.attributes && typeof product.attributes === "object" ? product.attributes : {});
  const rules = useMarketplaceRules();
  const variantTotal = variantStockTotal(variants);
  const effectiveStock = variantTotal ?? (Number(stock) || 0);

  const titleErr = validateTitle(title);
  const descErr = validateDesc(desc);
  const titleLen = title.trim().length;
  const descLen = desc.trim().length;

  function addNewFiles(files: FileList | null) {
    if (!files) return;
    const ok: { file: File; preview: string }[] = [];
    const newVars: Variant[] = [];
    for (const f of Array.from(files)) {
      if (images.length + newFiles.length + ok.length >= MAX_IMAGES) { toast.error(`Max ${MAX_IMAGES}`); break; }
      if (!ALLOWED_TYPES.includes(f.type)) { toast.error(`${f.name}: format non supporté`); continue; }
      if (f.size > MAX_IMG_MB * 1024 * 1024) { toast.error(`${f.name}: trop lourd`); continue; }
      ok.push({ file: f, preview: URL.createObjectURL(f) });
      newVars.push(emptyVariant());
    }
    setNewFiles((n) => [...n, ...ok]);
    setVariants((v) => [...v, ...newVars]);
  }

  function removeImage(i: number) {
    setImages((x) => x.filter((_, idx) => idx !== i));
    setVariants((v) => v.filter((_, idx) => idx !== i));
  }
  function removeNewFile(i: number) {
    setNewFiles((x) => x.filter((_, idx) => idx !== i));
    setVariants((v) => v.filter((_, idx) => idx !== images.length + i));
  }

  async function save() {
    if (titleErr) return toast.error(titleErr);
    if (descErr) return toast.error(descErr);
    if (images.length + newFiles.length === 0) return toast.error("Au moins une image");
    if (variants.some((v) => !v.price_mga || v.price_mga <= 0))
      return toast.error("Prix obligatoire pour chaque variante");
    const aErr = availabilityError(avail, effectiveStock, rules.maxAdvancePercent);
    if (aErr) return toast.error(aErr);

    setSaving(true);
    try {
      await assertSession();
      const uploaded: string[] = [];
      const editProvider = getStoredProvider();
      for (let i = 0; i < newFiles.length; i++) {
        toast.loading(
          `Envoi image ${i + 1}/${newFiles.length} vers ${editProvider === "drive" ? "Google Drive" : "le stockage interne"}…`,
          { id: "edit" },
        );
        uploaded.push(await uploadProductImage(editProvider, newFiles[i].file, product.id, i));
      }

      const finalImages = [...images, ...uploaded];
      const finalVariants = variants.slice(0, finalImages.length).map((v, i) => ({ image_index: i, ...v }));
      const minPrice = Math.min(...finalVariants.map((v: any) => v.price_mga));
      const firstUnit = finalVariants.flatMap((v: any) => v.units || [])[0] || product.unit || "unité";

      const { error } = await supabase.from("products").update({
        title, description: desc,
        stock: effectiveStock,
        unit: firstUnit,
        category_id: category || null,
        price_mga: minPrice,
        images: finalImages,
        variants: finalVariants,
        availability: avail.availability,
        preorder: avail.availability === "sur_commande" ? avail.preorder : {},
        advance_percent: avail.availability === "sur_commande" ? avail.advance_percent : 0,
        attributes: attrs,
      } as any).eq("id", product.id);
      if (error) throw new Error(error.message?.startsWith("Sur commande") || error.message?.startsWith("Avance") ? error.message : humanizeDbError(error));
      toast.success("Produit mis à jour ✅", { id: "edit" });
      onSaved();
    } catch (e: any) {
      console.error("[publish] échec édition", e);
      toast.error(e?.message ?? "Erreur", { id: "edit" });

    } finally {
      setSaving(false);
    }
  }

  const totalImgs = images.length + newFiles.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-2 md:items-center" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2">
          <h3 className="font-black">Modifier le produit</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX + 20} placeholder="Titre" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className={`mt-1 text-[10px] ${titleErr ? "text-destructive" : "text-mada-green"}`}>{titleErr ?? `✓ ${titleLen}/${TITLE_MAX} caractères`}</div>
          </div>
          <div>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={5} maxLength={DESC_MAX + 40} placeholder="Description" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className={`mt-1 text-[10px] ${descErr ? "text-destructive" : "text-mada-green"}`}>{descErr ?? `✓ ${descLen}/${DESC_MAX} caractères`}</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Stock
              <input type="number" min={0} value={variantTotal ?? stock} disabled={variantTotal !== null} onChange={(e) => setStock(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-70" />
              {variantTotal !== null && <span className="text-[10px] text-muted-foreground">Somme des stocks par variante</span>}
            </label>
            <label className="text-xs">Catégorie
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="">—</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <AttributesEditor value={attrs} onChange={setAttrs} />
          <ProductAvailabilityEditor value={avail} onChange={setAvail} rules={rules} examplePrice={minPositive(variants.map((v) => v.price_mga))} />
          <p className="text-[10px] text-muted-foreground">Les changements de disponibilité s'appliquent aux nouvelles commandes ; les commandes déjà payées gardent leurs conditions.</p>

          <div>
            <div className="text-xs font-bold mb-1">Images ({totalImgs}/{MAX_IMAGES})</div>
            <div className="grid grid-cols-4 gap-2">
              {images.map((url, i) => (
                <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-border">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => removeImage(i)} className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {newFiles.map((nf, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border-2 border-mada-green">
                  <img src={nf.preview} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => removeNewFile(i)} className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 text-white">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <label className="mt-2 block">
              <span className="text-[10px] text-muted-foreground">Ajouter d'autres images</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => addNewFiles(e.target.files)} className="mt-1 block w-full text-xs" />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold">Variantes (prix, couleurs, tailles, unités)</div>
            {variants.map((v, i) => {
              const src = i < images.length ? images[i] : newFiles[i - images.length]?.preview;
              return (
                <div key={i} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex gap-3">
                    {src && <img src={src} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                    <VariantEditor index={i} variant={v} onChange={(nv) => setVariants((arr) => arr.map((x, idx) => (idx === i ? nv : x)))} />
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={save} disabled={saving} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-mada-red py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50">
            <Save className="h-4 w-4" /> {saving ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Promo modal — remise % + durée (Flash si >= 20% avec échéance)
// ────────────────────────────────────────────────────────────
function PromoModal({
  product, onClose, onSaved,
}: { product: Product; onClose: () => void; onSaved: () => void }) {
  const current = Number((product as any).discount_percent ?? 0);
  const [percent, setPercent] = useState(current || 10);
  const [hours, setHours] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const newPrice = Math.floor((product.price_mga * (100 - percent)) / 100);

  async function save(clear = false) {
    setSaving(true);
    const until = clear || hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString();
    const { error } = await supabase.rpc("vendor_set_promo" as any, {
      _product_id: product.id,
      _percent: clear ? 0 : percent,
      _until: until,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(clear ? "Promotion retirée" : "Promotion activée 🎉");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-4 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-black">Promotion · {product.title}</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Remise</div>
            <div className="flex flex-wrap gap-1.5">
              {[5, 10, 15, 20, 30, 40, 50, 70].map((v) => (
                <button
                  key={v}
                  onClick={() => setPercent(v)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    percent === v ? "border-mada-red bg-mada-red text-primary-foreground" : "border-border"
                  }`}
                >
                  -{v}%
                </button>
              ))}
            </div>
            <input
              type="range"
              min={1}
              max={90}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="mt-2 w-full accent-mada-red"
            />
          </div>

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Durée</div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { l: "Illimitée", v: null },
                { l: "6 h ⚡", v: 6 },
                { l: "24 h ⚡", v: 24 },
                { l: "3 jours", v: 72 },
                { l: "7 jours", v: 168 },
              ].map((o) => (
                <button
                  key={o.l}
                  onClick={() => setHours(o.v)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${
                    hours === o.v ? "border-mada-green bg-mada-green text-secondary-foreground" : "border-border"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
            {percent >= 20 && hours !== null && (
              <div className="mt-1 text-[10px] font-bold text-mada-red">⚡ Apparaîtra dans la rubrique Flash</div>
            )}
          </div>

          <div className="rounded-xl bg-muted p-3 text-sm">
            <span className="text-muted-foreground line-through">{formatMGA(product.price_mga)}</span>{" "}
            <span className="font-black text-mada-red">{formatMGA(newPrice)}</span>
          </div>

          <div className="flex gap-2">
            {current > 0 && (
              <button
                onClick={() => save(true)}
                disabled={saving}
                className="rounded-xl border border-destructive px-3 py-2 text-xs font-bold text-destructive disabled:opacity-50"
              >
                Retirer
              </button>
            )}
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="flex-1 rounded-xl bg-mada-red py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50"
            >
              {saving ? "..." : "Activer la promo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
