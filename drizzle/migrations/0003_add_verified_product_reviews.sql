ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.vendor_profiles
  ADD COLUMN IF NOT EXISTS rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;

CREATE TABLE public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  vendor_id uuid NOT NULL REFERENCES public.vendor_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text NOT NULL CHECK (length(content) BETWEEN 2 AND 2000),
  images text[] NOT NULL DEFAULT '{}',
  is_verified_purchase boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, user_id)
);
GRANT SELECT ON public.product_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reviews TO authenticated;
GRANT ALL ON public.product_reviews TO service_role;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read published reviews" ON public.product_reviews
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "Clients insert verified reviews" ON public.product_reviews
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND status = 'published'
    AND is_verified_purchase
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.client_id = auth.uid()
        AND o.product_id = product_id AND o.vendor_id = vendor_id
        AND (o.status = 'livre' OR o.buyer_confirmed_at IS NOT NULL OR o.tracking_status = 'delivered')
    )
  );
CREATE POLICY "Authors update own reviews" ON public.product_reviews
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status = 'published' AND is_verified_purchase);
CREATE POLICY "Authors delete own reviews" ON public.product_reviews
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage reviews" ON public.product_reviews
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_product_reviews_product ON public.product_reviews(product_id, created_at DESC);
CREATE INDEX idx_product_reviews_vendor ON public.product_reviews(vendor_id);
CREATE INDEX idx_product_reviews_user ON public.product_reviews(user_id);

CREATE TABLE public.review_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, reporter_id)
);
GRANT SELECT, INSERT ON public.review_reports TO authenticated;
GRANT ALL ON public.review_reports TO service_role;
ALTER TABLE public.review_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users report reviews" ON public.review_reports
  FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid() AND status = 'open');
CREATE POLICY "Users read own reports" ON public.review_reports
  FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage reports" ON public.review_reports
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_review_reports_review ON public.review_reports(review_id);

CREATE OR REPLACE FUNCTION public.validate_verified_product_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO _order FROM public.orders WHERE id = NEW.order_id;
  IF NOT FOUND OR _order.client_id <> auth.uid() OR _order.product_id <> NEW.product_id
     OR _order.vendor_id <> NEW.vendor_id
     OR NOT (_order.status = 'livre' OR _order.buyer_confirmed_at IS NOT NULL OR _order.tracking_status = 'delivered') THEN
    RAISE EXCEPTION 'verified_purchase_required';
  END IF;
  NEW.user_id := auth.uid();
  NEW.is_verified_purchase := true;
  NEW.status := 'published';
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_verified_product_review() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_verified_product_review() TO service_role;
CREATE TRIGGER validate_verified_product_review_before_write
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_verified_product_review();

CREATE OR REPLACE FUNCTION public.refresh_review_ratings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _product_id uuid; _vendor_id uuid;
BEGIN
  _product_id := COALESCE(NEW.product_id, OLD.product_id);
  _vendor_id := COALESCE(NEW.vendor_id, OLD.vendor_id);
  UPDATE public.products p SET
    rating_avg = COALESCE((SELECT round(avg(r.rating)::numeric, 2) FROM public.product_reviews r WHERE r.product_id = _product_id AND r.status = 'published'), 0),
    rating_count = (SELECT count(*) FROM public.product_reviews r WHERE r.product_id = _product_id AND r.status = 'published')
  WHERE p.id = _product_id;
  UPDATE public.vendor_profiles v SET
    rating_avg = COALESCE((SELECT round(avg(r.rating)::numeric, 2) FROM public.product_reviews r WHERE r.vendor_id = _vendor_id AND r.status = 'published'), 0),
    rating_count = (SELECT count(*) FROM public.product_reviews r WHERE r.vendor_id = _vendor_id AND r.status = 'published')
  WHERE v.id = _vendor_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_review_ratings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_review_ratings() TO service_role;
CREATE TRIGGER refresh_review_ratings_after_write
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.refresh_review_ratings();

GRANT UPDATE (reaction) ON public.product_likes TO authenticated;
CREATE POLICY "Users update own reaction" ON public.product_likes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
ALTER TABLE public.product_likes ADD CONSTRAINT product_likes_reaction_valid CHECK (reaction IN ('like', 'love')) NOT VALID;