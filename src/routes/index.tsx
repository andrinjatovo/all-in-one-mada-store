import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/madastore/Hero";
import { Footer } from "@/components/madastore/Footer";

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
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-background">
      <Hero />
      <Footer />
    </main>
  );
}
