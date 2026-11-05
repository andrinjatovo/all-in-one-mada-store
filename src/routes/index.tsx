import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/madastore/Hero";
import { Footer } from "@/components/madastore/Footer";
import { MarketplaceFeed } from "@/components/madastore/MarketplaceFeed";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ALL IN ONE MADA STORE — Marketplace 100% Malagasy 🇲🇬" },
      {
        name: "description",
        content:
          "Achetez et vendez facilement à Madagascar. Marketplace nouvelle génération : rapide, sécurisée, accessible partout.",
      },
      { property: "og:title", content: "ALL IN ONE MADA STORE — Marketplace 100% Malagasy" },
      {
        property: "og:description",
        content: "La marketplace nouvelle génération 100% Malagasy. Rapide • Sécurisé • Accessible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <section id="catalogue" className="mx-auto max-w-7xl scroll-mt-4 px-6 py-8">
        <h2 className="mb-1 text-xl font-black">Découvrez le catalogue 🇲🇬</h2>
        <p className="mb-4 text-sm text-muted-foreground">Explorez librement les produits des vendeurs malagasy — un compte n’est demandé qu’au moment d’acheter.</p>
        <MarketplaceFeed />
      </section>
      <Footer />
    </main>
  );
}
