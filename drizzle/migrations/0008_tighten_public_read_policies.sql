DROP POLICY IF EXISTS "likes public read" ON public.product_likes;
CREATE POLICY "likes read on active products" ON public.product_likes FOR SELECT TO anon, authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));
DROP POLICY IF EXISTS "comments public read" ON public.product_comments;
CREATE POLICY "comments read on active products" ON public.product_comments FOR SELECT TO anon, authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));
DROP POLICY IF EXISTS "settings read" ON public.app_settings;
CREATE POLICY "settings read main row" ON public.app_settings FOR SELECT TO authenticated USING (id = 1);