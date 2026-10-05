ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendor_acceptance text NOT NULL DEFAULT 'en_attente',
  ADD COLUMN IF NOT EXISTS vendor_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS vendor_refusal_reason text,
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS normal_unit_price_mga bigint,
  ADD COLUMN IF NOT EXISTS coupon_percent smallint,
  ADD COLUMN IF NOT EXISTS negotiated_offer_id uuid,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'Wallet ALL IN ONE MADA STORE';
UPDATE public.orders SET vendor_acceptance = 'accepte', vendor_decided_at = created_at WHERE vendor_acceptance = 'en_attente';
ALTER TABLE public.orders ADD CONSTRAINT orders_vendor_acceptance_chk CHECK (vendor_acceptance IN ('en_attente','accepte','refuse'));

CREATE TABLE public.order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  actor_id uuid,
  field text NOT NULL,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order events parties" ON public.order_events FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.client_id = auth.uid() OR o.vendor_id = auth.uid())));

CREATE OR REPLACE FUNCTION public.log_order_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f text; o text; n text;
BEGIN
  FOREACH f IN ARRAY ARRAY['status','vendor_acceptance','tracking_status','depart_at','eta_at','depart_city','courier_name','coop_name','shipping_mode','delivery_fee_mga','shipping_address'] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f) INTO o, n USING OLD, NEW;
    IF o IS DISTINCT FROM n THEN
      INSERT INTO public.order_events(order_id, actor_id, field, old_value, new_value) VALUES (NEW.id, auth.uid(), f, o, n);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_log_changes AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.log_order_changes();

CREATE OR REPLACE FUNCTION public.vendor_decide_order(_order_id uuid, _accept boolean, _reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _admin uuid;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _o.vendor_acceptance <> 'en_attente' THEN RAISE EXCEPTION 'Décision déjà prise'; END IF;
  IF _accept THEN
    UPDATE public.orders SET vendor_acceptance='accepte', vendor_decided_at=now(), updated_at=now() WHERE id=_order_id;
    INSERT INTO public.notifications(user_id,title,body,link) VALUES (_o.client_id,'Commande acceptée ✅', _o.product_title || ' — votre facture est disponible.', '/client');
  ELSE
    UPDATE public.orders SET vendor_acceptance='refuse', vendor_decided_at=now(), vendor_refusal_reason=left(_reason,500),
      status='rembourse', tracking_status='cancelled', vendor_released=true, updated_at=now() WHERE id=_order_id;
    UPDATE public.wallets SET balance_mga = balance_mga + _o.total_mga, balance_spent_mga = GREATEST(0, balance_spent_mga - _o.total_mga), updated_at=now() WHERE user_id=_o.client_id;
    UPDATE public.wallets SET balance_pending_mga = GREATEST(0, balance_pending_mga - _o.vendor_amount_mga), updated_at=now() WHERE user_id=_o.vendor_id;
    SELECT user_id INTO _admin FROM public.user_roles WHERE role='admin' LIMIT 1;
    IF _admin IS NOT NULL AND _o.commission_mga > 0 THEN
      UPDATE public.wallets SET balance_commission_mga = GREATEST(0, balance_commission_mga - _o.commission_mga), updated_at=now() WHERE user_id=_admin;
      INSERT INTO public.wallet_transactions(user_id,type,amount_mga,reference_id,description) VALUES (_admin,'remboursement',-_o.commission_mga,_order_id,'Commission annulée : '||_o.product_title);
    END IF;
    UPDATE public.products SET stock = stock + _o.quantity, sold_count = GREATEST(0, sold_count - _o.quantity) WHERE id=_o.product_id;
    INSERT INTO public.wallet_transactions(user_id,type,amount_mga,reference_id,description) VALUES
      (_o.client_id,'remboursement',_o.total_mga,_order_id,'Remboursement (commande refusée) : '||_o.product_title),
      (_o.vendor_id,'remboursement',-_o.vendor_amount_mga,_order_id,'Commande refusée : '||_o.product_title);
    INSERT INTO public.notifications(user_id,title,body,link) VALUES (_o.client_id,'Commande refusée ❌', _o.product_title || coalesce(' — '||_reason,'') || '. Montant remboursé sur votre wallet.', '/client');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_order_invoice(_order_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _r jsonb;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id=_order_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF NOT (_o.client_id = auth.uid() OR _o.vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _o.vendor_acceptance <> 'accepte' THEN RAISE EXCEPTION 'Facture disponible après acceptation de la commande par le vendeur.'; END IF;
  SELECT jsonb_build_object(
    'order', to_jsonb(_o),
    'client', (SELECT jsonb_build_object('full_name', cp.full_name, 'phone', cp.phone, 'email', u.email) FROM auth.users u LEFT JOIN public.client_profiles cp ON cp.id=u.id WHERE u.id=_o.client_id),
    'address', (SELECT to_jsonb(a) - 'latitude' - 'longitude' FROM public.addresses a WHERE a.id=_o.address_id),
    'vendor', (SELECT jsonb_build_object('shop_name', v.shop_name, 'phone', v.phone, 'address', v.address, 'pickup_city', v.pickup_city, 'pickup_region', v.pickup_region, 'pickup_province', v.pickup_province, 'pickup_quartier', v.pickup_quartier) FROM public.vendor_profiles v WHERE v.id=_o.vendor_id),
    'events', (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at), '[]'::jsonb) FROM public.order_events e WHERE e.order_id=_o.id)
  ) INTO _r;
  RETURN _r;
END $$;

CREATE TABLE public.price_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  vendor_id uuid NOT NULL,
  client_id uuid NOT NULL,
  proposed_by uuid NOT NULL,
  color text, size text, unit text,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
  public_unit_price_mga bigint NOT NULL,
  unit_price_mga bigint NOT NULL CHECK (unit_price_mga > 0),
  status text NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente','accepte','refuse','expire','utilise','remplace')),
  parent_id uuid REFERENCES public.price_offers(id),
  expires_at timestamptz,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX price_offers_conv_idx ON public.price_offers(conversation_id, created_at);
GRANT SELECT ON public.price_offers TO authenticated;
GRANT ALL ON public.price_offers TO service_role;
ALTER TABLE public.price_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers parties read" ON public.price_offers FOR SELECT TO authenticated USING (client_id = auth.uid() OR vendor_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.propose_price_offer(_conversation_id uuid, _product_id uuid, _quantity int, _unit_price bigint, _color text DEFAULT NULL, _size text DEFAULT NULL, _unit text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _c public.conversations; _p public.products; _pub bigint; _id uuid;
BEGIN
  SELECT * INTO _c FROM public.conversations WHERE id=_conversation_id;
  IF _c.id IS NULL OR _c.client_id <> auth.uid() THEN RAISE EXCEPTION 'Seul le client de la conversation peut proposer'; END IF;
  SELECT * INTO _p FROM public.products WHERE id=_product_id AND vendor_id=_c.vendor_id AND is_active;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Produit indisponible'; END IF;
  IF _quantity > _p.stock THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
  _pub := _p.price_mga;
  IF _p.discount_percent > 0 AND (_p.promo_until IS NULL OR _p.promo_until > now()) THEN _pub := FLOOR(_pub*(100-_p.discount_percent)/100.0)::bigint; END IF;
  IF _unit_price <= 0 OR _unit_price >= _pub THEN RAISE EXCEPTION 'Le prix proposé doit être inférieur au prix actuel (% Ar)', _pub; END IF;
  UPDATE public.price_offers SET status='remplace', updated_at=now() WHERE conversation_id=_conversation_id AND product_id=_product_id AND status='en_attente';
  INSERT INTO public.price_offers(conversation_id, product_id, vendor_id, client_id, proposed_by, color, size, unit, quantity, public_unit_price_mga, unit_price_mga)
    VALUES (_conversation_id, _product_id, _c.vendor_id, _c.client_id, auth.uid(), left(_color,60), left(_size,60), left(_unit,60), _quantity, _pub, _unit_price) RETURNING id INTO _id;
  INSERT INTO public.messages(conversation_id, sender_id, content) VALUES (_conversation_id, auth.uid(), '🤝 Proposition : ' || _unit_price || ' Ar / unité pour « ' || _p.title || ' » x' || _quantity);
  UPDATE public.conversations SET last_message_at=now() WHERE id=_conversation_id;
  INSERT INTO public.notifications(user_id,title,body,link) VALUES (_c.vendor_id,'Nouvelle proposition de prix', _p.title, '/conversation/'||_conversation_id);
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.respond_price_offer(_offer_id uuid, _action text, _counter_price bigint DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.price_offers; _other uuid; _new uuid; _title text;
BEGIN
  SELECT * INTO _o FROM public.price_offers WHERE id=_offer_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Offre introuvable'; END IF;
  IF auth.uid() NOT IN (_o.client_id, _o.vendor_id) OR auth.uid() = _o.proposed_by THEN RAISE EXCEPTION 'Vous ne pouvez pas répondre à votre propre proposition'; END IF;
  IF _o.status <> 'en_attente' THEN RAISE EXCEPTION 'Cette proposition n''est plus active'; END IF;
  SELECT title INTO _title FROM public.products WHERE id=_o.product_id;
  _other := CASE WHEN auth.uid() = _o.client_id THEN _o.vendor_id ELSE _o.client_id END;
  IF _action = 'accepte' THEN
    UPDATE public.price_offers SET status='accepte', expires_at=now()+interval '48 hours', updated_at=now() WHERE id=_offer_id;
    INSERT INTO public.messages(conversation_id, sender_id, content) VALUES (_o.conversation_id, auth.uid(), '✅ Prix négocié accepté : ' || _o.unit_price_mga || ' Ar / unité (valable 48 h)');
    _new := _offer_id;
  ELSIF _action = 'refuse' THEN
    UPDATE public.price_offers SET status='refuse', updated_at=now() WHERE id=_offer_id;
    INSERT INTO public.messages(conversation_id, sender_id, content) VALUES (_o.conversation_id, auth.uid(), '❌ Proposition refusée');
    _new := _offer_id;
  ELSIF _action = 'contre' THEN
    IF _counter_price IS NULL OR _counter_price <= 0 OR _counter_price > _o.public_unit_price_mga THEN RAISE EXCEPTION 'Contre-proposition invalide'; END IF;
    UPDATE public.price_offers SET status='remplace', updated_at=now() WHERE id=_offer_id;
    INSERT INTO public.price_offers(conversation_id, product_id, vendor_id, client_id, proposed_by, color, size, unit, quantity, public_unit_price_mga, unit_price_mga, parent_id)
      VALUES (_o.conversation_id, _o.product_id, _o.vendor_id, _o.client_id, auth.uid(), _o.color, _o.size, _o.unit, _o.quantity, _o.public_unit_price_mga, _counter_price, _o.id) RETURNING id INTO _new;
    INSERT INTO public.messages(conversation_id, sender_id, content) VALUES (_o.conversation_id, auth.uid(), '💰 Contre-proposition : ' || _counter_price || ' Ar / unité');
  ELSE RAISE EXCEPTION 'Action invalide'; END IF;
  UPDATE public.conversations SET last_message_at=now() WHERE id=_o.conversation_id;
  INSERT INTO public.notifications(user_id,title,body,link) VALUES (_other,'Négociation : ' || coalesce(_title,''), CASE _action WHEN 'accepte' THEN 'Proposition acceptée' WHEN 'refuse' THEN 'Proposition refusée' ELSE 'Nouvelle contre-proposition' END, '/conversation/'||_o.conversation_id);
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.pay_price_offer(_offer_id uuid, _address text, _address_id uuid DEFAULT NULL, _delivery_fee bigint DEFAULT 0, _delivery_km double precision DEFAULT NULL, _delivery_days_min int DEFAULT NULL, _delivery_days_max int DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f public.price_offers; _p public.products; _buyer uuid := auth.uid(); _rate numeric; _days int; _items bigint; _grand bigint; _comm bigint; _vamt bigint; _admin uuid; _order uuid; _variant text;
BEGIN
  SELECT * INTO _f FROM public.price_offers WHERE id=_offer_id FOR UPDATE;
  IF _f.id IS NULL OR _f.client_id <> _buyer THEN RAISE EXCEPTION 'Offre réservée à un autre client'; END IF;
  IF _f.status = 'utilise' THEN RAISE EXCEPTION 'Offre déjà utilisée'; END IF;
  IF _f.status <> 'accepte' THEN RAISE EXCEPTION 'Offre non acceptée'; END IF;
  IF _f.expires_at IS NOT NULL AND _f.expires_at <= now() THEN
    UPDATE public.price_offers SET status='expire', updated_at=now() WHERE id=_offer_id;
    RAISE EXCEPTION 'Offre expirée';
  END IF;
  IF _address_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.addresses WHERE id=_address_id AND user_id=_buyer) THEN RAISE EXCEPTION 'Adresse invalide'; END IF;
  SELECT commission_rate, auto_release_days INTO _rate, _days FROM public.app_settings WHERE id=1;
  SELECT * INTO _p FROM public.products WHERE id=_f.product_id AND is_active FOR UPDATE;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'Produit indisponible'; END IF;
  IF _p.stock < _f.quantity THEN RAISE EXCEPTION 'Stock insuffisant'; END IF;
  _items := _f.unit_price_mga * _f.quantity;
  _grand := _items + GREATEST(COALESCE(_delivery_fee,0),0);
  _comm := FLOOR(_items * _rate)::bigint;
  _vamt := _items - _comm;
  IF (SELECT balance_mga FROM public.wallets WHERE user_id=_buyer) < _grand THEN RAISE EXCEPTION 'insufficient balance'; END IF;
  UPDATE public.wallets SET balance_mga=balance_mga-_grand, balance_spent_mga=balance_spent_mga+_grand, updated_at=now() WHERE user_id=_buyer;
  INSERT INTO public.wallets(user_id, balance_mga, balance_pending_mga) VALUES (_p.vendor_id, 0, _vamt+COALESCE(_delivery_fee,0))
    ON CONFLICT (user_id) DO UPDATE SET balance_pending_mga = wallets.balance_pending_mga + _vamt + COALESCE(_delivery_fee,0), updated_at=now();
  SELECT user_id INTO _admin FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF _admin IS NOT NULL AND _comm > 0 THEN
    INSERT INTO public.wallets(user_id, balance_commission_mga) VALUES (_admin,_comm)
      ON CONFLICT (user_id) DO UPDATE SET balance_commission_mga = wallets.balance_commission_mga + _comm, updated_at=now();
    INSERT INTO public.wallet_transactions(user_id,type,amount_mga,description) VALUES (_admin,'commission',_comm,'Commission: '||_p.title);
  END IF;
  UPDATE public.products SET stock=stock-_f.quantity, sold_count=sold_count+_f.quantity WHERE id=_p.id;
  _variant := nullif(concat_ws(' · ', _f.color, _f.size, _f.unit), '');
  INSERT INTO public.orders(client_id, vendor_id, product_id, product_title, product_image, quantity, unit_price_mga, total_mga, shipping_address, status,
      commission_mga, vendor_amount_mga, auto_release_at, delivery_fee_mga, delivery_km, delivery_days_min, delivery_days_max, address_id,
      variant_label, normal_unit_price_mga, negotiated_offer_id)
    VALUES (_buyer, _p.vendor_id, _p.id, _p.title, _p.images[1], _f.quantity, _f.unit_price_mga, _grand, _address, 'paye',
      _comm, _vamt+COALESCE(_delivery_fee,0), now()+(_days||' days')::interval, COALESCE(_delivery_fee,0), _delivery_km, _delivery_days_min, _delivery_days_max, _address_id,
      _variant, _f.public_unit_price_mga, _f.id) RETURNING id INTO _order;
  UPDATE public.price_offers SET status='utilise', order_id=_order, updated_at=now() WHERE id=_offer_id;
  INSERT INTO public.wallet_transactions(user_id,type,amount_mga,reference_id,description) VALUES
    (_buyer,'achat',-_grand,_order,'Achat (prix négocié): '||_p.title),
    (_p.vendor_id,'vendor_pending',_vamt+COALESCE(_delivery_fee,0),_order,'En attente: '||_p.title);
  INSERT INTO public.messages(conversation_id, sender_id, content) VALUES (_f.conversation_id, _buyer, '💳 Commande payée au prix négocié');
  INSERT INTO public.notifications(user_id,title,body,link) VALUES
    (_p.vendor_id,'Nouvelle commande (prix négocié) 🛍️', _p.title||' x'||_f.quantity, '/vendeur'),
    (_buyer,'Commande enregistrée ✅', _p.title||' — en attente d''acceptation vendeur', '/client');
  RETURN _order;
END $$;

CREATE OR REPLACE FUNCTION public.hide_old_client_orders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.orders SET client_hidden = true
   WHERE client_hidden = false AND status IN ('livre','annule','rembourse')
     AND COALESCE(released_at, buyer_confirmed_at, delivered_at, vendor_decided_at, updated_at) < now() - interval '5 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.vendor_decide_order(uuid,boolean,text), public.get_order_invoice(uuid), public.propose_price_offer(uuid,uuid,int,bigint,text,text,text), public.respond_price_offer(uuid,text,bigint), public.pay_price_offer(uuid,text,uuid,bigint,double precision,int,int), public.hide_old_client_orders(), public.log_order_changes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_decide_order(uuid,boolean,text), public.get_order_invoice(uuid), public.propose_price_offer(uuid,uuid,int,bigint,text,text,text), public.respond_price_offer(uuid,text,bigint), public.pay_price_offer(uuid,text,uuid,bigint,double precision,int,int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hide_old_client_orders() TO service_role;

DO $$ BEGIN
  PERFORM cron.schedule('hide-old-client-orders', '15 1 * * *', 'SELECT public.hide_old_client_orders()');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'cron not scheduled: %', SQLERRM;
END $$;