-- Guest (visitor) mode: read-only access to the public catalogue only.
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.categories TO anon;

-- Shops: only public storefront columns (no phone, address or pickup data).
GRANT SELECT (id, shop_name, logo_url, banner_url, description, status, created_at, rating_avg, rating_count)
  ON public.vendor_profiles TO anon;
DROP POLICY IF EXISTS "anon read active vendors" ON public.vendor_profiles;
CREATE POLICY "anon read active vendors" ON public.vendor_profiles
  FOR SELECT TO anon USING (status = 'actif'::public.vendor_status);

-- Reaction counters without exposing who reacted.
GRANT SELECT (id, product_id, reaction, created_at) ON public.product_likes TO anon;

-- Public comments without the author's account id.
GRANT SELECT (id, product_id, author_name, content, created_at) ON public.product_comments TO anon;

-- Published reviews without the author's account id or order id.
GRANT SELECT (id, product_id, vendor_id, rating, content, images, is_verified_purchase, status, created_at)
  ON public.product_reviews TO anon;

-- Photos attached to published reviews can be viewed through short-lived signed URLs.
DROP POLICY IF EXISTS "Review images published read anon" ON storage.objects;
CREATE POLICY "Review images published read anon" ON storage.objects
  FOR SELECT TO anon
  USING (
    bucket_id = 'reviews'
    AND EXISTS (
      SELECT 1 FROM public.product_reviews r
      WHERE r.status = 'published' AND storage.objects.name = ANY (r.images)
    )
  );

-- Marketplace rules shown on product pages (commission & max advance for "sur commande").
GRANT SELECT (id, commission_rate, max_advance_percent) ON public.app_settings TO anon;
DROP POLICY IF EXISTS "settings anon read rules" ON public.app_settings;
CREATE POLICY "settings anon read rules" ON public.app_settings
  FOR SELECT TO anon USING (id = 1);

-- Catalogue feed only returns public product columns.
GRANT EXECUTE ON FUNCTION public.feed_products(text, uuid, text, bigint, bigint, integer, integer) TO anon;