// Règles d'affichage « produit sur commande ».
// Les montants réels sont toujours recalculés et appliqués par la base de données ;
// ce module ne sert qu'à afficher la même répartition au client et au vendeur.

export type Availability = "disponible_localement" | "sur_commande";

export type PreorderInfo = {
  origin_country?: string;
  origin_city?: string;
  supplier?: string;
  available_at?: string; // AAAA-MM-JJ
  supply_days?: string | number; // délai d'arrivée à Madagascar
  prep_days?: string | number; // préparation + expédition
  delivery_days?: string | number; // livraison au client
  conditions?: string;
  advance_percent?: number;
};

export type PreorderSplit = {
  total: number;
  itemsTotal: number;
  deliveryFee: number;
  commission: number;
  vendorShare: number;
  advance: number;
  protectedAmount: number;
  percent: number;
};

/** Même calcul que la base : avance = min(% autorisé × produits, part vendeur hors livraison). */
export function computePreorderSplit(input: {
  itemsTotal: number;
  deliveryFee?: number;
  commissionRate: number;
  advancePercent: number;
  maxAdvancePercent: number;
}): PreorderSplit {
  const itemsTotal = Math.max(0, Math.floor(input.itemsTotal));
  const deliveryFee = Math.max(0, Math.floor(input.deliveryFee ?? 0));
  const percent = Math.max(0, Math.min(input.advancePercent, input.maxAdvancePercent));
  const commission = Math.floor(itemsTotal * input.commissionRate);
  const vendorShare = itemsTotal - commission;
  const advance = Math.min(Math.floor((itemsTotal * percent) / 100), Math.max(vendorShare, 0));
  const total = itemsTotal + deliveryFee;
  return { total, itemsTotal, deliveryFee, commission, vendorShare, advance, protectedAmount: total - advance, percent };
}

export function totalPreorderDays(p: PreorderInfo | null | undefined): number {
  if (!p) return 0;
  return [p.supply_days, p.prep_days, p.delivery_days].reduce<number>((s, v) => s + (Number(v) || 0), 0);
}

/** Erreurs du formulaire vendeur (mêmes règles que la base). */
export function validatePreorder(p: PreorderInfo, advancePercent: number, maxAdvance: number, today = new Date()): string | null {
  if (!p.origin_country || p.origin_country.trim().length < 2) return "Indiquez le pays ou lieu d'approvisionnement";
  if (!p.available_at || !/^\d{4}-\d{2}-\d{2}$/.test(p.available_at)) return "Indiquez la date estimée de disponibilité";
  const todayStr = today.toISOString().slice(0, 10);
  if (p.available_at < todayStr) return "La date estimée de disponibilité doit être dans le futur";
  if (!(Number(p.supply_days) >= 1)) return "Indiquez le délai d'arrivée à Madagascar (jours)";
  if (p.prep_days === undefined || p.prep_days === "" || !(Number(p.prep_days) >= 0)) return "Indiquez le délai de préparation (jours)";
  if (!(Number(p.delivery_days) >= 1)) return "Indiquez le délai de livraison au client (jours)";
  if (advancePercent < 0) return "Avance invalide";
  if (advancePercent > maxAdvance) return `Avance limitée à ${maxAdvance} % par l'administration`;
  return null;
}

export const SUPPLY_STEPS = [
  { id: "commande_fournisseur", label: "🧾 Commande fournisseur effectuée" },
  { id: "approvisionnement", label: "🚢 Approvisionnement en cours" },
  { id: "arrive_madagascar", label: "🇲🇬 Produit arrivé à Madagascar" },
  { id: "pret_expedition", label: "📦 Prêt à être expédié" },
] as const;

export function supplyLabel(id: string | null | undefined): string {
  if (id === "avance_versee") return "💰 Avance vendeur versée";
  if (id === "eta_update") return "📅 Nouvelle date estimée";
  return SUPPLY_STEPS.find((s) => s.id === id)?.label ?? "⏳ En attente d'approvisionnement";
}

export function formatDateFr(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("fr-FR");
}
