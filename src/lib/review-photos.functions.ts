import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Signs short-lived URLs only for photos attached to PUBLISHED reviews of one product.
export const getPublishedReviewPhotoUrls = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("product_reviews")
      .select("images")
      .eq("product_id", data.productId)
      .eq("status", "published");
    const paths = Array.from(new Set((rows ?? []).flatMap((r) => r.images ?? []))).slice(0, 200);
    if (!paths.length) return {} as Record<string, string>;
    const { data: signed } = await supabaseAdmin.storage.from("reviews").createSignedUrls(paths, 3600);
    const map: Record<string, string> = {};
    signed?.forEach((s, i) => { if (s.signedUrl) map[paths[i]] = s.signedUrl; });
    return map;
  });
