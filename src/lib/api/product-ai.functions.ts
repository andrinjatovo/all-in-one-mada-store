import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  imageBase64: z.string().min(20).max(8_000_000),
  mimeType: z.string().default("image/jpeg"),
  currentTitle: z.string().max(200).default(""),
  categories: z.array(z.object({ id: z.string(), name: z.string() })).max(60).default([]),
});

export type ProductAISuggestion = {
  title: string;
  description: string;
  category_id: string | null;
  category_name: string | null;
  subcategory: string;
  product_type: string;
  material: string;
  colors: string[];
  sizes: string[];
  units: string[];
  suggested_unit: string;
  keywords: string[];
  confidence: "haute" | "moyenne" | "faible";
  warnings: string[];
};

const ALLOWED_UNITS = [
  "unité", "pièce", "paire", "boîte", "plaquette", "sachet", "lot", "paquet",
  "g", "kg", "mL", "L", "cm", "m", "m²", "m³", "pouce", "Ah", "W", "V",
];

/** Analyse IA d'une image produit : préremplissage à vérifier par le vendeur (jamais de publication automatique). */
export const analyzeProductWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { suggestion: null as ProductAISuggestion | null, error: "IA non configurée" };

    const catList = data.categories.map((c) => `${c.id} = ${c.name}`).join("\n");
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Tu es expert e-commerce à Madagascar. À partir d'une image produit et d'un titre brut, tu prépares un BROUILLON de fiche produit en français que le vendeur vérifiera. " +
                "Règles strictes : n'invente jamais une caractéristique non visible ou non déductible avec certitude. " +
                "Titre : 15 à 30 caractères. Description : 60 à 360 caractères, professionnelle, sans prix, sans promesse non vérifiable. " +
                "Catégorie : UNIQUEMENT un id de la liste fournie. Sous-catégorie et type de produit : courts (ex. « Baskets », « Chaussure de sport »). " +
                "Matière : uniquement si raisonnablement identifiable, sinon chaîne vide. " +
                "Couleurs : uniquement celles visibles sur l'image. Tailles/pointures : seulement si le type de produit en a habituellement (vêtements, chaussures) ; sinon liste vide. Ne jamais lister de variantes non visibles. " +
                `Unités : choisis parmi ${ALLOWED_UNITS.join(", ")}. Pièce pour téléphone/sac/robe/appareil ; paire pour chaussures/sandales ; kg ou g pour produits au poids ; L ou mL pour liquides ; m pour tissus/câbles ; lot ou paquet pour ensembles. suggested_unit = la plus adaptée. ` +
                "keywords : 3 à 8 mots-clés de recherche. confidence : haute, moyenne ou faible. " +
                "warnings : liste les doutes (image floue, plusieurs produits, marque non lisible, catégorie incertaine…). Si l'image est insuffisante, mets confidence=faible et explique-le dans warnings.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Titre saisi par le vendeur: "${data.currentTitle}".\nCatégories disponibles:\n${catList}` },
                { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` } },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "product_suggestion",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  category_id: { type: "string" },
                  category_name: { type: "string" },
                  subcategory: { type: "string" },
                  product_type: { type: "string" },
                  material: { type: "string" },
                  colors: { type: "array", items: { type: "string" } },
                  sizes: { type: "array", items: { type: "string" } },
                  units: { type: "array", items: { type: "string" } },
                  suggested_unit: { type: "string" },
                  keywords: { type: "array", items: { type: "string" } },
                  confidence: { type: "string", enum: ["haute", "moyenne", "faible"] },
                  warnings: { type: "array", items: { type: "string" } },
                },
                required: [
                  "title", "description", "category_id", "category_name", "subcategory", "product_type", "material",
                  "colors", "sizes", "units", "suggested_unit", "keywords", "confidence", "warnings",
                ],
              },
            },
          },
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        console.error("product AI error", res.status, t);
        return {
          suggestion: null,
          error:
            res.status === 429 ? "Trop de requêtes IA, réessayez dans un instant."
            : res.status === 402 ? "Crédits IA épuisés : contactez l'administration."
            : "L'analyse IA n'a pas abouti. Remplissez la fiche manuellement ou réessayez.",
        };
      }
      const json: any = await res.json();
      const raw = json?.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as ProductAISuggestion;
      const valid = data.categories.some((c) => c.id === parsed.category_id);
      const units = (parsed.units ?? []).filter((u) => ALLOWED_UNITS.includes(u));
      const warnings = [...(parsed.warnings ?? [])];
      if (!valid) warnings.push("Catégorie non reconnue : choisissez-la manuellement.");
      return {
        suggestion: {
          ...parsed,
          category_id: valid ? parsed.category_id : null,
          units,
          suggested_unit: ALLOWED_UNITS.includes(parsed.suggested_unit) ? parsed.suggested_unit : units[0] ?? "",
          keywords: (parsed.keywords ?? []).slice(0, 8),
          warnings,
        } satisfies ProductAISuggestion,
        error: null,
      };
    } catch (e) {
      console.error("product AI failed", e);
      return { suggestion: null, error: "Analyse impossible (réseau). Réessayez ou remplissez la fiche manuellement." };
    }
  });
