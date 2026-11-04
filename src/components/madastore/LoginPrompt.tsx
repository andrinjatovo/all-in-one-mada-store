import { useNavigate } from "@tanstack/react-router";
import { LogIn, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rememberReturnPath } from "@/lib/guest-intent";

const MESSAGES = {
  buy: "Pour continuer votre achat, connectez-vous ou créez gratuitement votre compte ALL IN ONE MADA STORE.",
  message: "Pour écrire à la boutique, connectez-vous ou créez gratuitement votre compte ALL IN ONE MADA STORE.",
  social: "Pour réagir ou commenter, connectez-vous ou créez gratuitement votre compte ALL IN ONE MADA STORE.",
  feature: "Cette fonctionnalité nécessite un compte. Connectez-vous ou créez gratuitement votre compte ALL IN ONE MADA STORE.",
} as const;

export type LoginReason = keyof typeof MESSAGES;

export function LoginPrompt({
  reason,
  returnPath,
  onClose,
}: {
  reason: LoginReason;
  returnPath: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  function go(mode: "login" | "signup") {
    rememberReturnPath(returnPath);
    navigate({ to: "/auth/client", search: mode === "signup" ? { mode: "signup" } : {} });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connexion requise"
        className="w-full max-w-md rounded-t-3xl border border-border bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-base font-black">Connexion requise</div>
          <button onClick={onClose} aria-label="Fermer" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{MESSAGES[reason]}</p>
        {reason === "buy" && (
          <p className="mt-2 text-xs text-muted-foreground">Votre produit, vos variantes et la quantité choisie seront conservés.</p>
        )}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button className="h-12 font-black" onClick={() => go("login")}><LogIn /> Se connecter</Button>
          <Button variant="outline" className="h-12 font-black" onClick={() => go("signup")}><UserPlus /> Créer un compte</Button>
        </div>
      </div>
    </div>
  );
}
