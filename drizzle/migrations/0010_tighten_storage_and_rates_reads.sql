-- Exchange-rate history is only displayed in the admin dashboard.
DROP POLICY IF EXISTS "rates read" ON public.exchange_rate_history;
CREATE POLICY "rates admin read" ON public.exchange_rate_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Review photos (private bucket): readable by the uploader, admins, or when attached to a published review.
DROP POLICY IF EXISTS "Authenticated users read review images" ON storage.objects;
CREATE POLICY "Review images owner or published read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'reviews'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.product_reviews r
        WHERE r.status = 'published' AND storage.objects.name = ANY (r.images)
      )
    )
  );

-- Chat attachments: API reads limited to the uploader, admins, or participants of a conversation containing the file.
DROP POLICY IF EXISTS "chat participants read" ON storage.objects;
CREATE POLICY "chat owner or participant read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.messages m
        JOIN public.conversations c ON c.id = m.conversation_id
        WHERE (c.client_id = auth.uid() OR c.vendor_id = auth.uid())
          AND m.image_url IS NOT NULL
          AND right(m.image_url, length(storage.objects.name) + 1) = '/' || storage.objects.name
      )
    )
  );

-- Product images are served through public URLs; API listing is limited to the owning vendor and admins.
DROP POLICY IF EXISTS "products authenticated read" ON storage.objects;
CREATE POLICY "products owner or admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'products'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );