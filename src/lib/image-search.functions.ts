import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  imageBase64: z.string().min(20).max(8_000_000),
  mimeType: z.string().regex(/^image\/[a-z0-9.+-]{1,40}$/i).default("image/jpeg"),
});

export const analyzeProductImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => Input.parse(i))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { keywords: "", error: "AI non configuré" };
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
                "Tu es un moteur de recherche visuel produit. Analyse l'image et réponds UNIQUEMENT par 3 à 6 mots-clés français séparés par des espaces, décrivant le produit principal (type, couleur, matière). Aucune phrase, pas de ponctuation.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Quels sont les mots-clés produit ?" },
                { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        console.error("image search AI err", res.status, t);
        return { keywords: "", error: res.status === 429 ? "Trop de requêtes" : "Erreur IA" };
      }
      const json = await res.json();
      const keywords: string = (json?.choices?.[0]?.message?.content ?? "").trim().replace(/[.,;:!?"']/g, "");
      return { keywords, error: null };
    } catch (e) {
      console.error(e);
      return { keywords: "", error: "Réseau" };
    }
  });
