import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { formatMGA } from "./Money";
import { Search, ShoppingCart, Camera, X, Loader2, Flame, Ticket, Zap, Sparkles, TrendingUp, BadgePercent } from "lucide-react";
import { analyzeProductImage } from "@/lib/image-search.functions";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

type Product = {
  id: string;
  title: string;
  price_mga: number;
  images: string[];
  category_id: string | null;
  discount_percent: number;
  promo_until: string | null;
  sold_count: number;
  view_count: number;
  click_count: number;
  final_price_mga: number;
};
type Category = { id: string; name: string; icon: string | null };

const PAGE_SIZE = 24;

const TABS = [
  { id: "pour_toi", label: "Pour toi", icon: <Sparkles className="h-3 w-3" /> },
  { id: "promos", label: "Promos", icon: <BadgePercent className="h-3 w-3" /> },
  { id: "coupons", label: "Coupons", icon: <Ticket className="h-3 w-3" /> },
  { id: "flash", label: "Flash", icon: <Zap className="h-3 w-3" /> },
  { id: "tendance", label: "Tendance", icon: <TrendingUp className="h-3 w-3" /> },
  { id: "nouveautes", label: "Nouveautés", icon: <Flame className="h-3 w-3" /> },
];

function computeFinal(p: any): Product {
  const promoOk = p.discount_percent > 0 && (!p.promo_until || new Date(p.promo_until) > new Date());
  return {
    ...p,
    final_price_mga: promoOk
      ? Math.floor((p.price_mga * (100 - p.discount_percent)) / 100)
      : p.price_mga,
  } as Product;
}

export function MarketplaceFeed() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [tab, setTab] = useState("pour_toi");
  const [q, setQ] = useState("");
  const [qd, setQd] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [imgSearching, setImgSearching] = useState(false);
  const [imgBadge, setImgBadge] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const analyze = useServerFn(analyzeProductImage);
  const { user } = useAuth();

  useEffect(() => {
    supabase.from("categories").select("*").then((r) => setCats((r.data ?? []) as Category[]));
    refreshCart();
    const handler = () => refreshCart();
    window.addEventListener("dago-cart-changed", handler);
    return () => window.removeEventListener("dago-cart-changed", handler);
  }, []);

  function refreshCart() {
    try {
      const raw = localStorage.getItem("dago_cart");
      const arr = raw ? JSON.parse(raw) : [];
      setCartCount(arr.reduce((s: number, i: any) => s + (i.qty ?? 0), 0));
    } catch {
      setCartCount(0);
    }
  }

  // Recherche débouncée : évite une requête par frappe
  useEffect(() => {
    const t = setTimeout(() => setQd(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Repli : requête directe sur les produits (jamais de page vide si des produits existent)
  const fallbackPage = useCallback(
    async (offset: number): Promise<Product[]> => {
      let query = supabase
        .from("products")
        .select("id,title,price_mga,images,category_id,discount_percent,promo_until,sold_count,view_count,click_count,created_at")
        .eq("is_active", true)
        .gt("stock", 0)
        .order("sold_count", { ascending: false })
        .order("price_mga", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (cat) query = query.eq("category_id", cat);
      if (qd) query = query.ilike("title", `%${qd}%`);
      const { data } = await query;
      return ((data ?? []) as any[]).map(computeFinal);
    },
    [cat, qd],
  );

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      let list: Product[] = [];
      const { data, error } = await supabase.rpc("feed_products" as any, {
        _tab: tab,
        _category: cat,
        _q: qd || null,
        _min_price: null,
        _max_price: null,
        _limit: PAGE_SIZE,
        _offset: offset,
      } as any);
      if (!error) list = ((data ?? []) as any[]) as Product[];

      // Si l'IA ne renvoie rien (ou échoue) sur la 1ʳᵉ page, on affiche tous les produits
      if (list.length === 0 && replace) {
        list = await fallbackPage(offset);
      }
      setHasMore(list.length === PAGE_SIZE);
      setProducts((prev) => {
        if (replace) return list;
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...list.filter((p) => !seen.has(p.id))];
      });
    },
    [cat, qd, tab, fallbackPage],
  );

  useEffect(() => {
    setLoading(true);
    setHasMore(true);
    fetchPage(0, true).finally(() => setLoading(false));
  }, [fetchPage]);

  // Enregistre la recherche pour l'IA de recommandation
  useEffect(() => {
    if (user) supabase.rpc("grant_loyalty_coupons" as any).then(() => {});
  }, [user]);

  useEffect(() => {
    if (!qd || !user) return;
    supabase.rpc("track_event" as any, { _event_type: "search", _query: qd } as any).then(() => {});
  }, [qd, user]);


  useEffect(() => {
    if (!sentinelRef.current || loading || !hasMore) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          setLoadingMore(true);
          fetchPage(products.length, false).finally(() => setLoadingMore(false));
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [products.length, hasMore, loadingMore, loading, fetchPage]);

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!user) return toast.error("Connectez-vous pour utiliser la recherche par photo");
    if (f.size > 6_000_000) return toast.error("Image trop grande (max 6 Mo)");
    setImgSearching(true);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
        r.onerror = reject;
        r.readAsDataURL(f);
      });
      const out = await analyze({ data: { imageBase64: b64, mimeType: f.type || "image/jpeg" } });
      if (out.error || !out.keywords) {
        toast.error(out.error || "Aucun mot-clé détecté");
      } else {
        setQ(out.keywords);
        setImgBadge(out.keywords);
        toast.success("Recherche visuelle : " + out.keywords);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erreur");
    } finally {
      setImgSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Filtres IA — discret, au-dessus de la recherche */}
      <div className="-mx-6 flex gap-4 overflow-x-auto px-6 scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-1 border-b-2 pb-1.5 text-[13px] transition-colors ${
              tab === t.id
                ? "border-mada-red font-bold text-mada-red"
                : "border-transparent font-medium text-muted-foreground"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full rounded-full border border-border bg-muted/40 pl-10 pr-11 py-2.5 text-sm outline-none transition-colors focus:border-mada-red focus:bg-background"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={imgSearching}
            title="Recherche par image"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:text-mada-red disabled:opacity-50"
          >
            {imgSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </div>
        <Link
          to="/cart"
          className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mada-red text-primary-foreground"
        >
          <ShoppingCart className="h-5 w-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">
              {cartCount}
            </span>
          )}
        </Link>
      </div>

      {imgBadge && (
        <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs">
          <Camera className="h-3 w-3" />
          <span className="truncate">{imgBadge}</span>
          <button onClick={() => { setImgBadge(null); setQ(""); }} className="ml-auto shrink-0">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Catégories */}
      <div className="-mx-6 flex gap-1.5 overflow-x-auto px-6 pb-1 scrollbar-hide">
        <CatChip active={cat === null} onClick={() => setCat(null)} label="Tout" icon="🌍" />
        {cats.map((c) => (
          <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={c.name} icon={c.icon ?? "📦"} />
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Aucun produit trouvé.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} tracked={!!user} />
            ))}
          </div>
          <div ref={sentinelRef} className="flex h-12 items-center justify-center text-xs text-muted-foreground">
            {loadingMore ? "Chargement..." : hasMore ? "" : "— Fin —"}
          </div>
        </>
      )}
    </div>
  );
}

function ProductCard({ p, tracked }: { p: Product; tracked: boolean }) {
  const promo = p.discount_percent > 0 && (!p.promo_until || new Date(p.promo_until) > new Date());
  const flash = promo && p.discount_percent >= 20 && !!p.promo_until;
  return (
    <Link
      to="/product/$id"
      params={{ id: p.id }}
      onClick={() => {
        if (!tracked) return;
        supabase.rpc("increment_product_click" as any, { _product_id: p.id } as any).then(() => {});
        supabase.rpc("track_event" as any, { _event_type: "click", _product_id: p.id } as any).then(() => {});
      }}
      className="group overflow-hidden rounded-2xl bg-card transition-transform active:scale-[0.98]"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
        {p.images?.[0] ? (
          <img
            src={p.images[0]}
            alt={p.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">📦</div>
        )}
        {promo && (
          <span className="absolute left-2 top-2 rounded-full bg-mada-red px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
            {flash ? "⚡ " : ""}-{p.discount_percent}%
          </span>
        )}
      </div>
      <div className="px-1 pt-2 pb-3">
        <div className="line-clamp-2 min-h-[32px] text-xs leading-tight text-foreground/80">{p.title}</div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-sm font-bold text-mada-red">{formatMGA(p.final_price_mga ?? p.price_mga)}</span>
          {promo && <span className="text-[10px] text-muted-foreground line-through">{formatMGA(p.price_mga)}</span>}
        </div>
        {p.sold_count > 0 && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">{p.sold_count} vendus</div>
        )}
      </div>
    </Link>
  );
}

function CatChip({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      <span>{icon}</span> {label}
    </button>
  );
}
