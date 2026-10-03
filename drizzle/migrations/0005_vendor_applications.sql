ALTER TYPE public.vendor_status ADD VALUE IF NOT EXISTS 'suspendu';

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS min_stock_per_item integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_shop_age_months integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS usdt_rate_mga numeric NOT NULL DEFAULT 4500,
  ADD COLUMN IF NOT EXISTS usdt_rate_updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE public.exchange_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  currency text NOT NULL DEFAULT 'USDT',
  rate_mga numeric NOT NULL,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exchange_rate_history TO authenticated;
GRANT ALL ON public.exchange_rate_history TO service_role;
ALTER TABLE public.exchange_rate_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rates read" ON public.exchange_rate_history FOR SELECT TO authenticated USING (true);

CREATE TABLE public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE DEFAULT ('VND-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  user_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','soumis','en_examen','correction','approuve','refuse','suspendu')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  form_version text NOT NULL DEFAULT '1.0',
  exception_allowed boolean NOT NULL DEFAULT false,
  correction_request text,
  decision_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.vendor_applications TO authenticated;
GRANT ALL ON public.vendor_applications TO service_role;
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app owner read" ON public.vendor_applications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "app owner insert" ON public.vendor_applications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = 'brouillon');
CREATE POLICY "app owner edit draft" ON public.vendor_applications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status IN ('brouillon','correction'))
  WITH CHECK (user_id = auth.uid() AND status IN ('brouillon','correction'));

CREATE OR REPLACE FUNCTION public.vendor_app_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') AND auth.uid() IS NOT NULL THEN
    NEW.exception_allowed := OLD.exception_allowed;
    NEW.reviewed_by := OLD.reviewed_by; NEW.reviewed_at := OLD.reviewed_at;
    NEW.decision_reason := OLD.decision_reason; NEW.ref := OLD.ref; NEW.user_id := OLD.user_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER vendor_app_guard BEFORE UPDATE ON public.vendor_applications FOR EACH ROW EXECUTE FUNCTION public.vendor_app_guard();

CREATE TABLE public.vendor_application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.vendor_applications(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendor_application_events TO authenticated;
GRANT ALL ON public.vendor_application_events TO service_role;
ALTER TABLE public.vendor_application_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events read" ON public.vendor_application_events FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.vendor_applications a WHERE a.id = application_id AND a.user_id = auth.uid()));

CREATE TABLE public.vendor_doc_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.vendor_applications(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.vendor_doc_access_log TO authenticated;
GRANT ALL ON public.vendor_doc_access_log TO service_role;
ALTER TABLE public.vendor_doc_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc log admin" ON public.vendor_doc_access_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin') AND admin_id = auth.uid());

CREATE OR REPLACE FUNCTION public.submit_vendor_application() RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.vendor_applications; s public.app_settings; d jsonb; months int; photos int; k text;
BEGIN
  SELECT * INTO a FROM public.vendor_applications WHERE user_id = auth.uid();
  IF a.id IS NULL THEN RAISE EXCEPTION 'Aucun dossier'; END IF;
  IF a.status NOT IN ('brouillon','correction') THEN RAISE EXCEPTION 'Dossier déjà soumis'; END IF;
  SELECT * INTO s FROM public.app_settings LIMIT 1;
  d := a.data;
  FOREACH k IN ARRAY ARRAY['full_name','phone','shop_name','shop_type','activity','shop_created_at','description','stock_location','courier_name','courier_phone','province','region','district','commune','fokontany','quartier','lot','id_type','id_front','residence_cert','face_photo'] LOOP
    IF coalesce(trim(d->>k),'') = '' THEN RAISE EXCEPTION 'Champ obligatoire manquant : %', k; END IF;
  END LOOP;
  months := (extract(year FROM age(now(), (d->>'shop_created_at')::date))*12 + extract(month FROM age(now(), (d->>'shop_created_at')::date)))::int;
  IF months < coalesce(s.min_shop_age_months,12) AND NOT a.exception_allowed THEN RAISE EXCEPTION 'Ancienneté insuffisante (% mois)', months; END IF;
  IF coalesce((d->>'avg_qty_per_item')::int,0) < coalesce(s.min_stock_per_item,30) AND NOT a.exception_allowed THEN RAISE EXCEPTION 'Stock insuffisant par article'; END IF;
  photos := coalesce(jsonb_array_length(d->'shop_photos'),0);
  IF photos < 2 OR photos > 4 THEN RAISE EXCEPTION 'Il faut 2 à 4 photos de la boutique'; END IF;
  IF (d->>'id_type') = 'cin' AND coalesce(d->>'id_back','') = '' THEN RAISE EXCEPTION 'Verso de la CIN manquant'; END IF;
  IF coalesce(jsonb_array_length(d->'consents'),0) < 10 THEN RAISE EXCEPTION 'Tous les consentements sont requis'; END IF;
  UPDATE public.vendor_applications SET status='soumis', submitted_at=now(), correction_request=NULL WHERE id=a.id;
  INSERT INTO public.vendor_application_events(application_id, actor_id, action) VALUES (a.id, auth.uid(), 'soumis');
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (auth.uid(), 'Candidature envoyée', 'Dossier '||a.ref||' en attente de validation (24 à 72 h indicatif).', '/vendeur');
  INSERT INTO public.notifications(user_id, title, body, link)
    SELECT ur.user_id, 'Nouvelle candidature vendeur', 'Dossier '||a.ref, '/admin' FROM public.user_roles ur WHERE ur.role='admin';
  RETURN a.ref;
END $$;

CREATE OR REPLACE FUNCTION public.admin_review_vendor_application(_id uuid, _action text, _note text, _allow_exception boolean DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.vendor_applications; new_status text; msg text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO a FROM public.vendor_applications WHERE id=_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Dossier introuvable'; END IF;
  IF _allow_exception IS NOT NULL THEN
    UPDATE public.vendor_applications SET exception_allowed=_allow_exception WHERE id=_id;
    INSERT INTO public.vendor_application_events(application_id, actor_id, action, note) VALUES (_id, auth.uid(), CASE WHEN _allow_exception THEN 'exception_accordee' ELSE 'exception_retiree' END, _note);
    IF _action = 'exception' THEN RETURN; END IF;
  END IF;
  IF _action IN ('refuse','correction','suspendu') AND coalesce(trim(_note),'') = '' THEN RAISE EXCEPTION 'Motif obligatoire'; END IF;
  new_status := CASE _action WHEN 'approuve' THEN 'approuve' WHEN 'refuse' THEN 'refuse' WHEN 'correction' THEN 'correction' WHEN 'suspendu' THEN 'suspendu' WHEN 'en_examen' THEN 'en_examen' ELSE NULL END;
  IF new_status IS NULL THEN RAISE EXCEPTION 'Action invalide'; END IF;
  UPDATE public.vendor_applications SET status=new_status, reviewed_by=auth.uid(), reviewed_at=now(),
    decision_reason = CASE WHEN _action IN ('refuse','suspendu','approuve') THEN _note ELSE decision_reason END,
    correction_request = CASE WHEN _action='correction' THEN _note ELSE correction_request END
  WHERE id=_id;
  IF _action='approuve' THEN
    INSERT INTO public.vendor_profiles(id, shop_name, phone, status, description)
      VALUES (a.user_id, coalesce(a.data->>'shop_name','Boutique'), coalesce(a.data->>'phone',''), 'actif', a.data->>'description')
      ON CONFLICT (id) DO UPDATE SET status='actif', shop_name=EXCLUDED.shop_name, updated_at=now();
    INSERT INTO public.user_roles(user_id, role) VALUES (a.user_id,'vendeur') ON CONFLICT DO NOTHING;
  ELSIF _action='refuse' THEN
    UPDATE public.vendor_profiles SET status='rejete', updated_at=now() WHERE id=a.user_id;
  ELSIF _action='suspendu' THEN
    UPDATE public.vendor_profiles SET status='suspendu', updated_at=now() WHERE id=a.user_id;
    UPDATE public.products SET is_active=false WHERE vendor_id=a.user_id;
  END IF;
  INSERT INTO public.vendor_application_events(application_id, actor_id, action, note) VALUES (_id, auth.uid(), _action, _note);
  msg := CASE _action WHEN 'approuve' THEN 'Votre boutique est approuvée. Vous pouvez publier vos produits.'
    WHEN 'refuse' THEN 'Votre candidature a été refusée : '||_note
    WHEN 'correction' THEN 'Des corrections sont demandées : '||_note
    WHEN 'suspendu' THEN 'Votre compte vendeur est suspendu : '||_note
    ELSE 'Votre dossier est en cours d''examen.' END;
  INSERT INTO public.notifications(user_id, title, body, link) VALUES (a.user_id, 'Candidature vendeur '||a.ref, msg, '/vendeur');
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_vendor_settings(_commission numeric, _min_stock int, _min_age int, _usdt numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_rate numeric;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _commission < 0 OR _commission > 0.5 OR _min_stock < 0 OR _min_age < 0 OR _usdt <= 0 THEN RAISE EXCEPTION 'Valeurs invalides'; END IF;
  SELECT usdt_rate_mga INTO old_rate FROM public.app_settings LIMIT 1;
  UPDATE public.app_settings SET commission_rate=_commission, min_stock_per_item=_min_stock, min_shop_age_months=_min_age,
    usdt_rate_mga=_usdt, usdt_rate_updated_at = CASE WHEN _usdt <> old_rate THEN now() ELSE usdt_rate_updated_at END, updated_at=now();
  IF _usdt <> old_rate THEN INSERT INTO public.exchange_rate_history(rate_mga, changed_by) VALUES (_usdt, auth.uid()); END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.submit_vendor_application() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_review_vendor_application(uuid,text,text,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_vendor_settings(numeric,int,int,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_vendor_application(uuid,text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_vendor_settings(numeric,int,int,numeric) TO authenticated, service_role;

INSERT INTO public.exchange_rate_history(rate_mga) SELECT usdt_rate_mga FROM public.app_settings LIMIT 1;