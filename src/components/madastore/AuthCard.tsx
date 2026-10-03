import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { dashboardPathForRole, type AppRole } from "@/lib/auth";
import { recordAcceptances } from "@/lib/legal-acceptance";
import { ArrowLeft, ExternalLink } from "lucide-react";

const LEGAL_CHECKS = [
  { key: "cgu", slug: "cgu", label: "J'ai lu et j'accepte les", link: "CGU" },
  { key: "cgv", slug: "cgv", label: "J'ai lu et j'accepte les", link: "CGV" },
  {
    key: "confidentialite",
    slug: "confidentialite",
    label: "J'ai pris connaissance de la",
    link: "Politique de Confidentialité",
  },
] as const;

interface Props {
  variant: "client" | "vendeur";
  title: string;
  subtitle: string;
  accent: "red" | "green";
  icon: ReactNode;
}

export function AuthCard({ variant, title, subtitle, accent, icon }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);

  // common
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // client signup
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // vendor signup
  const [shopName, setShopName] = useState("");

  // legal acceptance
  const [accepted, setAccepted] = useState<Record<string, boolean>>({
    cgu: false,
    cgv: false,
    confidentialite: false,
  });
  const allAccepted = LEGAL_CHECKS.every((c) => accepted[c.key]);


  const accentBtn =
    accent === "red"
      ? "bg-gradient-red shadow-glow-red"
      : "bg-mada-green shadow-glow-green";
  const accentText = accent === "red" ? "text-mada-red" : "text-mada-green";
  const accentBorder = accent === "red" ? "border-mada-red" : "border-mada-green";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Fetch role to redirect properly
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Connexion échouée");
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const priority: AppRole[] = ["admin", "vendeur", "client"];
        const role = priority.find((r) => roles?.some((x) => x.role === r)) ?? null;
        toast.success("Connecté avec succès");
        const intendedPath = window.sessionStorage.getItem("mada-return-after-login");
        if (intendedPath?.startsWith("/") && !intendedPath.startsWith("//")) {
          window.sessionStorage.removeItem("mada-return-after-login");
          window.location.assign(intendedPath);
          return;
        }
        navigate({ to: dashboardPathForRole(role) });
      } else {
        if (!allAccepted) throw new Error("Veuillez accepter les conditions obligatoires");
        const metadata =
          variant === "vendeur"
            ? { role: "vendeur", shop_name: shopName, phone }
            : { role: "client", full_name: fullName, phone, address };
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: metadata, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (signUpData.user && signUpData.session) {
          await recordAcceptances(
            signUpData.user.id,
            LEGAL_CHECKS.map((c) => c.key),
          );
        }
        toast.success(
          variant === "vendeur"
            ? "Compte créé. En attente de validation par l'admin."
            : "Compte créé. Vous êtes connecté !",
        );
        navigate({ to: variant === "vendeur" ? "/vendeur" : "/client" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <div className="mx-auto w-full max-w-md px-6 py-10 flex-1 flex flex-col">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
        </Link>

        <div className="rounded-3xl border border-border bg-card/90 backdrop-blur p-8 shadow-xl animate-mada-fade-up">
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl border-2 ${accentBorder} ${accentText}`}
            >
              {icon}
            </div>
            <h1 className="text-2xl font-black tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Tabs */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-lg py-2 text-sm font-semibold transition-all ${
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {mode === "signup" && variant === "client" && (
              <Field label="Nom complet" required>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input"
                />
              </Field>
            )}
            {mode === "signup" && variant === "vendeur" && (
              <Field label="Nom de la boutique" required>
                <input
                  required
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="input"
                />
              </Field>
            )}

            <Field label="Email" required>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoComplete="email"
              />
            </Field>

            {mode === "signup" && (
              <Field label="Téléphone" required={variant === "vendeur"}>
                <input
                  required={variant === "vendeur"}
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  placeholder="+261 ..."
                />
              </Field>
            )}

            {mode === "signup" && variant === "client" && (
              <Field label="Adresse">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="input"
                />
              </Field>
            )}

            <Field label="Mot de passe" required>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Field>

            {mode === "signup" && (
              <div className="space-y-2.5 rounded-xl border border-border bg-muted/40 p-3.5">
                {LEGAL_CHECKS.map((c) => (
                  <label key={c.key} className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={!!accepted[c.key]}
                      onChange={(e) =>
                        setAccepted((s) => ({ ...s, [c.key]: e.target.checked }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-mada-green)]"
                    />
                    <span className="min-w-0 flex-1 leading-snug">
                      {c.label}{" "}
                      <Link
                        to="/legal/$slug"
                        params={{ slug: c.slug }}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-bold text-mada-green underline underline-offset-2"
                      >
                        {c.link}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </span>
                  </label>
                ))}
                <Link
                  to="/legal"
                  target="_blank"
                  className="block pt-1 text-xs text-muted-foreground underline underline-offset-2"
                >
                  Voir tous les documents juridiques
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (mode === "signup" && !allAccepted)}
              className={`w-full rounded-xl ${accentBtn} px-6 py-3.5 text-base font-bold text-primary-foreground transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {loading ? "Patientez..." : mode === "login" ? "Se connecter" : "Créer mon compte"}
            </button>
          </form>

          {variant === "vendeur" && mode === "signup" && (
            <p className="mt-4 text-xs text-center text-muted-foreground">
              ⚠️ Votre compte vendeur devra être validé par l'administrateur avant d'être actif.
            </p>
          )}
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 0.75rem;
          border: 1px solid var(--color-border);
          background: var(--color-background);
          font-size: 0.95rem;
          transition: all 0.15s;
        }
        .input:focus {
          outline: none;
          border-color: var(--color-ring);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-ring) 20%, transparent);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-mada-red">*</span>}
      </span>
      {children}
    </label>
  );
}
