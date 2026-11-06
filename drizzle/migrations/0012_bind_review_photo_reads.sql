DROP POLICY IF EXISTS "Review images published read anon" ON storage.objects;
DROP POLICY IF EXISTS "Review images owner or published read" ON storage.objects;
CREATE POLICY "Review images owner or admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'reviews'
    AND (
      owner_id = (select auth.uid()::text)
      OR (select auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role((select auth.uid()), 'admin'::public.app_role)
    )
  );