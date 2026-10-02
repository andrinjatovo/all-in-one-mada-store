import { createFileRoute } from "@tanstack/react-router";
import { MessagesPanel } from "@/components/madastore/MessagesPanel";
import { ProtectedShell } from "@/components/madastore/ProtectedShell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/conversation/$id")({
  head: () => ({ meta: [
    { title: "Conversation boutique — ALL IN ONE MADA STORE" },
    { name: "description", content: "Échangez directement avec une boutique." },
    { property: "og:title", content: "Conversation boutique — ALL IN ONE MADA STORE" },
    { property: "og:description", content: "Messagerie sécurisée de la marketplace." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ConversationPage,
});

function ConversationPage() {
  const { id } = Route.useParams();
  const { user, role } = useAuth();
  if (!user || !role) return null;
  return <ProtectedShell expectedRole={role} title="Conversation"><MessagesPanel userId={user.id} initialConversationId={id} /></ProtectedShell>;
}