import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { AuthCard } from "@/components/madastore/AuthCard";

export const Route = createFileRoute("/auth/client")({
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" } =>
    search.mode === "signup" ? { mode: "signup" } : {},
  head: () => ({
    meta: [
      { title: "Espace Client — ALL IN ONE MADA STORE" },
      { name: "description", content: "Connectez-vous ou créez gratuitement votre compte client ALL IN ONE MADA STORE." },
      { property: "og:title", content: "Espace Client — ALL IN ONE MADA STORE" },
      { property: "og:description", content: "Connexion et inscription client sur la marketplace 100% Malagasy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClientAuth,
});

function ClientAuth() {
  const { mode } = Route.useSearch();
  return (
    <AuthCard
      variant="client"
      title="Espace Client"
      subtitle="Achetez facilement vos produits"
      accent="red"
      icon={<ShoppingBag className="h-6 w-6" />}
      initialMode={mode === "signup" ? "signup" : "login"}
    />
  );
}
