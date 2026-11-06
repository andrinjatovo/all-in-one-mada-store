import { Link } from "@tanstack/react-router";
import { ShoppingBag, Store, ShieldCheck, Truck, MessageCircle, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-hero animate-mada-shimmer">
      {/* Decorative blurred orbs */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-mada-red opacity-20 blur-3xl animate-mada-float" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-mada-green opacity-20 blur-3xl animate-mada-float" style={{ animationDelay: "1.5s" }} />

      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-28 sm:pt-28 sm:pb-36">
        {/* Logo / Brand */}
        <div className="flex justify-center animate-mada-fade-up" style={{ animationDelay: "0.05s" }}>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-mada blur-2xl opacity-50 animate-mada-glow" />
            <div className="relative flex items-center gap-3 rounded-2xl bg-card/80 backdrop-blur px-6 py-3 shadow-glow-red animate-mada-float">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-red text-primary-foreground font-black text-xl">
                M
              </div>
              <div className="text-left leading-tight">
                <div className="text-xs font-medium tracking-widest text-mada-green">ALL IN ONE</div>
                <div className="text-lg font-black tracking-tight text-foreground">MADA STORE 🇲🇬</div>
              </div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <h1
          className="mt-12 text-center text-5xl font-black leading-[1.05] tracking-tight text-foreground sm:text-7xl animate-mada-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          Achetez et vendez{" "}
          <span className="bg-gradient-red bg-clip-text text-transparent">facilement</span>
          <br />à Madagascar
        </h1>

        <p
          className="mx-auto mt-6 max-w-2xl text-center text-lg text-muted-foreground sm:text-xl animate-mada-fade-up"
          style={{ animationDelay: "0.35s" }}
        >
          La marketplace nouvelle génération <span className="font-semibold text-mada-green">100% Malagasy</span>.
          Rapide • Sécurisé • Accessible partout.
        </p>

        {/* CTA Buttons */}
        <div
          className="mt-12 flex flex-col items-stretch justify-center gap-5 sm:flex-row animate-mada-fade-up"
          style={{ animationDelay: "0.5s" }}
        >
          <Link
            to="/auth/client"
            className="group relative inline-flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-gradient-red px-10 py-5 text-primary-foreground shadow-glow-red transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_80px_-20px_color-mix(in_oklab,var(--mada-red)_70%,transparent)] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            <div className="relative flex items-center gap-3">
              <ShoppingBag className="h-6 w-6" />
              <span className="text-xl font-bold">Je suis Client</span>
            </div>
            <span className="relative text-xs font-medium opacity-90">Achetez facilement vos produits</span>
          </Link>

          <Link
            to="/auth/vendeur"
            className="group relative inline-flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl border-2 border-mada-green bg-card/60 backdrop-blur px-10 py-5 text-foreground transition-all duration-300 hover:-translate-y-1 hover:bg-mada-green hover:text-secondary-foreground hover:shadow-glow-green active:scale-[0.98]"
          >
            <div className="relative flex items-center gap-3">
              <Store className="h-6 w-6 text-mada-green group-hover:text-secondary-foreground transition-colors" />
              <span className="text-xl font-bold">Je suis Vendeur</span>
            </div>
            <span className="relative text-xs font-medium text-muted-foreground group-hover:text-secondary-foreground/90">
              Vendez et gagnez de l'argent
            </span>
          </Link>
        </div>

        {/* Trust badges */}
        <div
          className="mt-20 grid grid-cols-2 gap-4 sm:grid-cols-4 animate-mada-fade-up"
          style={{ animationDelay: "0.7s" }}
        >
          {[
            { icon: ShieldCheck, label: "Paiement sécurisé", color: "text-mada-red" },
            { icon: Truck, label: "Livraison rapide", color: "text-mada-green" },
            { icon: MessageCircle, label: "Support 24/7", color: "text-mada-red" },
            { icon: Sparkles, label: "100% Malagasy 🇲🇬", color: "text-mada-green" },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-card/70 backdrop-blur p-4 transition-all duration-300 hover:-translate-y-1 hover:border-mada-red hover:shadow-glow-red"
            >
              <Icon className={`h-7 w-7 ${color} transition-transform group-hover:scale-110`} />
              <span className="text-sm font-semibold text-foreground text-center">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
