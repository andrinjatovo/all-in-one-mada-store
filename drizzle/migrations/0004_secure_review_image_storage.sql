CREATE POLICY "Authenticated users read review images"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reviews');

CREATE POLICY "Review authors upload own images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'reviews'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Review authors delete own images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'reviews'
  AND auth.uid()::text = (storage.foldername(name))[1]
);