import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MessageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

const SYSTEM_PROMPT = `Tu es l'assistant officiel d'ALL IN ONE MADA STORE, le marketplace n°1 de Madagascar.
Tu réponds en français, de façon courte, chaleureuse, claire.
Tu aides les clients et vendeurs sur : commandes, dépôt sur wallet (avec capture de preuve), validation vendeur, paiement interne, livraison, retours, sécurité du compte.
Mention monnaie : MGA (Ariary) et parfois USDT.
Si la question dépasse tes capacités (litige, remboursement complexe), invite l'utilisateur à ouvrir un ticket support humain.
N'invente pas de prix, ni d'adresses, ni d'informations sur des produits spécifiques.`;

export const askMadaAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MessageSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { reply: "Le service IA n'est pas configuré pour le moment.", error: true };
    }
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          // Only the caller's own (user-role) messages are forwarded: client-supplied
          // "assistant" turns are untrusted and could be forged to steer the model.
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...data.messages
              .filter((m) => m.role === "user")
              .slice(-20)
              .map((m) => ({ role: "user" as const, content: m.content })),
          ],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        console.error("AI gateway error", res.status, txt);
        if (res.status === 429) {
          return { reply: "Trop de requêtes. Réessayez dans un instant.", error: true };
        }
        return { reply: "Désolé, je n'ai pas pu répondre. Ouvrez un ticket si urgent.", error: true };
      }
      const json = await res.json();
      const reply: string = json?.choices?.[0]?.message?.content ?? "Pas de réponse.";
      return { reply, error: false };
    } catch (e) {
      console.error("AI call failed", e);
      return { reply: "Erreur réseau. Réessayez.", error: true };
    }
  });
