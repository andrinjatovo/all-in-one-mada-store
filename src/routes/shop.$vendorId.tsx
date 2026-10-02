import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Package, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/madastore/BackButton";
import { Stars } from "@/components/madastore/ProductReviews";
import { formatMGA } from "@/components/madastore/Money";

export const Route = createFileRoute("/shop/$vendorId")({
  head: () => ({ meta: [
    { title: "Boutique vendeur — ALL IN ONE MADA STORE" },
    { name: "description", content: "Découvrez une boutique et ses produits sur ALL IN ONE MADA STORE." },
    { property: "og:title", content: "Boutique vendeur — ALL IN ONE MADA STORE" },
    { property: "og:description", content: "Produits, avis et informations publiques de la boutique." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ShopPage,
});

function ShopPage() {
  const { vendorId } = Route.useParams();
  const [shop, setShop] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("vendor_profiles").select("id,shop_name,logo_url,banner_url,description,created_at,rating_avg,rating_count").eq("id", vendorId).eq("status", "actif").maybeSingle(),
      supabase.from("products").select("id,title,images,price_mga,discount_percent,promo_until,sold_count").eq("vendor_id", vendorId).eq("is_active", true).order("created_at", { ascending: false }),
    ]).then(([profile, productRows]) => { setShop(profile.data); setProducts(productRows.data ?? []); setLoading(false); });
  }, [vendorId]);

  if (loading) return <div className="grid min-h-screen place-items-center text-muted-foreground">Chargement de la boutique…</div>;
  if (!shop) return <div className="grid min-h-screen place-items-center text-muted-foreground">Boutique introuvable ou inactive.</div>;
  const sold = products.reduce((sum, product) => sum + Number(product.sold_count ?? 0), 0);

  return <main className="min-h-screen bg-background pb-12">
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur"><BackButton fallback="/client" /><h1 className="truncate text-sm font-black">{shop.shop_name}</h1></header>
    <div className="mx-auto max-w-6xl">
      <div className="relative h-40 overflow-hidden bg-muted sm:h-56">{shop.banner_url ? <img src={shop.banner_url} alt={`Bannière ${shop.shop_name}`} className="h-full w-full object-cover" /> : <div className="h-full bg-gradient-mada" />}</div>
      <section className="px-4 pb-6">
        <div className="-mt-10 flex items-end gap-4"><div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-md border-4 border-background bg-card text-3xl font-black">{shop.logo_url ? <img src={shop.logo_url} alt={`Logo ${shop.shop_name}`} className="h-full w-full object-cover" /> : shop.shop_name.slice(0, 1).toUpperCase()}</div><div className="min-w-0 pb-1"><h2 className="truncate text-2xl font-black">{shop.shop_name}</h2><Stars value={Number(shop.rating_avg ?? 0)} count={shop.rating_count ?? 0} /></div></div>
        {shop.description && <p className="mt-4 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">{shop.description}</p>}
        <div className="mt-5 grid grid-cols-3 gap-2 border-y border-border py-4 text-center"><div><Package className="mx-auto mb-1 text-mada-red"/><strong>{products.length}</strong><p className="text-xs text-muted-foreground">Produits</p></div><div><ShoppingBag className="mx-auto mb-1 text-mada-green"/><strong>{sold}</strong><p className="text-xs text-muted-foreground">Vendus</p></div><div><CalendarDays className="mx-auto mb-1"/><strong>{new Date(shop.created_at).toLocaleDateString("fr-FR", { year: "numeric", month: "short" })}</strong><p className="text-xs text-muted-foreground">Sur la plateforme</p></div></div>
      </section>
      <section className="px-4"><h2 className="mb-3 text-lg font-black">Produits de la boutique</h2>{products.length === 0 ? <p className="text-sm text-muted-foreground">Aucun produit actif.</p> : <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">{products.map((product) => {
        const promo = product.discount_percent > 0 && (!product.promo_until || new Date(product.promo_until) > new Date());
        const price = promo ? Math.floor(product.price_mga * (100 - product.discount_percent) / 100) : product.price_mga;
        return <Link key={product.id} to="/product/$id" params={{ id: product.id }} className="overflow-hidden rounded-md bg-card"><div className="aspect-square bg-muted">{product.images?.[0] ? <img src={product.images[0]} alt={product.title} loading="lazy" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">📦</div>}</div><div className="p-2"><h3 className="line-clamp-2 min-h-8 text-xs">{product.title}</h3><p className="mt-1 text-sm font-black text-mada-red">{formatMGA(price)}</p><p className="text-[10px] text-muted-foreground">{product.sold_count ?? 0} vendus</p></div></Link>;
      })}</div>}</section>
    </div>
  </main>;
}