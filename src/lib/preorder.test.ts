import { describe, expect, it } from "vitest";
import { computePreorderSplit, validatePreorder } from "./preorder";

describe("répartition du paiement sur commande", () => {
  it("100 000 Ar avec 30 % d'avance : 30 000 au vendeur, 70 000 protégés", () => {
    const s = computePreorderSplit({ itemsTotal: 100_000, commissionRate: 0.1, advancePercent: 30, maxAdvancePercent: 30 });
    expect(s.total).toBe(100_000);
    expect(s.advance).toBe(30_000);
    expect(s.protectedAmount).toBe(70_000);
  });

  it("l'avance ne dépasse jamais le maximum fixé par l'admin", () => {
    const s = computePreorderSplit({ itemsTotal: 100_000, commissionRate: 0.1, advancePercent: 50, maxAdvancePercent: 30 });
    expect(s.advance).toBe(30_000);
  });

  it("la livraison et la commission sont séparées de l'avance", () => {
    const s = computePreorderSplit({ itemsTotal: 100_000, deliveryFee: 5_000, commissionRate: 0.1, advancePercent: 30, maxAdvancePercent: 30 });
    expect(s.total).toBe(105_000);
    expect(s.commission).toBe(10_000);
    expect(s.advance).toBe(30_000);
    expect(s.protectedAmount).toBe(75_000);
  });

  it("l'avance ne dépasse jamais la part du vendeur", () => {
    const s = computePreorderSplit({ itemsTotal: 100_000, commissionRate: 0.1, advancePercent: 100, maxAdvancePercent: 100 });
    expect(s.advance).toBe(90_000);
  });
});

describe("formulaire sur commande", () => {
  const ok = { origin_country: "Chine", available_at: "2099-01-01", supply_days: 20, prep_days: 2, delivery_days: 3 };
  it("refuse une avance supérieure au maximum", () => {
    expect(validatePreorder(ok, 40, 30)).toMatch(/30 %/);
  });
  it("exige le pays d'approvisionnement", () => {
    expect(validatePreorder({ ...ok, origin_country: "" }, 10, 30)).not.toBeNull();
  });
  it("accepte un formulaire complet", () => {
    expect(validatePreorder(ok, 30, 30)).toBeNull();
  });
});
