import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ProductShareMeta = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  priceMga: number;
  shopName: string | null;
} | null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public, read-only: share-preview data for an active product (public catalogue columns only). */
export const getProductShareMeta = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => {
    if (!input || typeof input.id !== "string" || !UUID_RE.test(input.id)) return { id: "" };
    return { id: input.id };
  })
  .handler(async ({ data }): Promise<ProductShareMeta> => {
    if (!data.id) return null;
    try {
      const url = process.env["SUPABASE_URL"];
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
      if (!url || !key) return null;
      const sb = createClient<Database>(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        global: {
          fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
      });
      const { data: p } = await sb
        .from("products")
        .select("id,title,description,images,price_mga,discount_percent,promo_until,vendor_id,variants")
        .eq("id", data.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!p) return null;
      const { data: v } = await sb.from("vendor_profiles").select("shop_name").eq("id", p.vendor_id).maybeSingle();
      const promo = p.discount_percent > 0 && (!p.promo_until || new Date(p.promo_until) > new Date());
      const v0 = Array.isArray(p.variants) ? (p.variants as any[])[0] : null;
      const base = Number(v0?.price_mga ?? p.price_mga);
      const price = promo ? Math.floor((base * (100 - p.discount_percent)) / 100) : base;
      const image = (p.images ?? []).find((i) => typeof i === "string" && i.startsWith("https://")) ?? null;
      return {
        id: p.id,
        title: p.title,
        description: (p.description ?? "").replace(/\s+/g, " ").trim().slice(0, 160),
        image,
        priceMga: price,
        shopName: v?.shop_name ?? null,
      };
    } catch (err) {
      console.error("getProductShareMeta failed", err);
      return null;
    }
  });
