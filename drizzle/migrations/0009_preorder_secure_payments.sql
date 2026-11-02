-- ═════════ Paramètre admin : avance maximale ═════════
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS max_advance_percent numeric(5,2) NOT NULL DEFAULT 30;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_max_advance_chk CHECK (max_advance_percent >= 0 AND max_advance_percent <= 100);

-- ═════════ Produits : disponibilité ═════════
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'disponible_localement',
  ADD COLUMN IF NOT EXISTS preorder jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS advance_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.products
  ADD CONSTRAINT products_availability_chk CHECK (availability IN ('disponible_localement','sur_commande'));
ALTER TABLE public.products
  ADD CONSTRAINT products_advance_percent_chk CHECK (advance_percent >= 0 AND advance_percent <= 100);

CREATE OR REPLACE FUNCTION public.validate_product_availability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _max numeric; _pre jsonb; _d date;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.availability IS NOT DISTINCT FROM OLD.availability
     AND NEW.preorder IS NOT DISTINCT FROM OLD.preorder
     AND NEW.advance_percent IS NOT DISTINCT FROM OLD.advance_percent THEN
    RETURN NEW;
  END IF;
  IF NEW.availability = 'disponible_localement' THEN
    NEW.advance_percent := 0;
    RETURN NEW;
  END IF;
  _pre := COALESCE(NEW.preorder, '{}'::jsonb);
  IF length(trim(COALESCE(_pre->>'origin_country',''))) < 2 THEN
    RAISE EXCEPTION 'Sur commande : pays ou lieu d''approvisionnement obligatoire';
  END IF;
  IF COALESCE(_pre->>'available_at','') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Sur commande : date estimée de disponibilité obligatoire';
  END IF;
  _d := (_pre->>'available_at')::date;
  IF _d < current_date THEN
    RAISE EXCEPTION 'Sur commande : la date estimée de disponibilité doit être dans le futur';
  END IF;
  IF COALESCE(_pre->>'supply_days','') !~ '^\d{1,3}$' OR (_pre->>'supply_days')::int < 1 THEN
    RAISE EXCEPTION 'Sur commande : délai d''arrivée à Madagascar obligatoire';
  END IF;
  IF COALESCE(_pre->>'prep_days','') !~ '^\d{1,3}$' THEN
    RAISE EXCEPTION 'Sur commande : délai de préparation obligatoire';
  END IF;
  IF COALESCE(_pre->>'delivery_days','') !~ '^\d{1,3}$' OR (_pre->>'delivery_days')::int < 1 THEN
    RAISE EXCEPTION 'Sur commande : délai de livraison au client obligatoire';
  END IF;
  SELECT max_advance_percent INTO _max FROM public.app_settings WHERE id = 1;
  IF NEW.advance_percent > COALESCE(_max, 0) THEN
    RAISE EXCEPTION 'Avance vendeur supérieure au maximum autorisé par l''administration (% %%)', COALESCE(_max, 0);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER products_validate_availability
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_availability();

-- ═════════ Commandes : avance, solde protégé, approvisionnement, litige ═════════
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'disponible_localement',
  ADD COLUMN IF NOT EXISTS advance_mga bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_released_mga bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS preorder_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS supply_status text,
  ADD COLUMN IF NOT EXISTS supply_eta date,
  ADD COLUMN IF NOT EXISTS supply_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dispute_status text,
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS dispute_opened_by uuid,
  ADD COLUMN IF NOT EXISTS dispute_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_resolution text,
  ADD COLUMN IF NOT EXISTS refunded_mga bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_type_chk CHECK (fulfillment_type IN ('disponible_localement','sur_commande'));
ALTER TABLE public.orders ADD CONSTRAINT orders_supply_status_chk CHECK (supply_status IS NULL OR supply_status IN ('commande_fournisseur','approvisionnement','arrive_madagascar','pret_expedition'));
ALTER TABLE public.orders ADD CONSTRAINT orders_dispute_status_chk CHECK (dispute_status IS NULL OR dispute_status IN ('ouvert','resolu'));
ALTER TABLE public.orders ADD CONSTRAINT orders_amounts_chk CHECK (advance_mga >= 0 AND advance_released_mga >= 0 AND advance_released_mga <= advance_mga AND refunded_mga >= 0);
ALTER TABLE public.orders DROP CONSTRAINT orders_vendor_acceptance_chk;
ALTER TABLE public.orders ADD CONSTRAINT orders_vendor_acceptance_chk CHECK (vendor_acceptance IN ('en_attente','accepte','refuse','annule_client'));
CREATE INDEX IF NOT EXISTS orders_open_disputes_idx ON public.orders (dispute_opened_at) WHERE dispute_status = 'ouvert';

-- Remplissage automatique à la création (toutes les fonctions de paiement passent par ici)
CREATE OR REPLACE FUNCTION public.apply_order_fulfillment()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _av text; _pre jsonb; _pct numeric; _max numeric; _items bigint;
BEGIN
  SELECT availability, preorder, advance_percent INTO _av, _pre, _pct FROM public.products WHERE id = NEW.product_id;
  NEW.advance_released_mga := 0;
  NEW.advance_released_at := NULL;
  NEW.refunded_mga := 0;
  NEW.dispute_status := NULL;
  NEW.supply_status := NULL;
  NEW.supply_history := '[]'::jsonb;
  IF _av = 'sur_commande' THEN
    SELECT max_advance_percent INTO _max FROM public.app_settings WHERE id = 1;
    _pct := LEAST(COALESCE(_pct, 0), COALESCE(_max, 0));
    _items := NEW.unit_price_mga * NEW.quantity;
    NEW.fulfillment_type := 'sur_commande';
    NEW.advance_mga := LEAST(FLOOR(_items * _pct / 100.0)::bigint, GREATEST(NEW.vendor_amount_mga - COALESCE(NEW.delivery_fee_mga, 0), 0));
    NEW.preorder_snapshot := COALESCE(_pre, '{}'::jsonb) || jsonb_build_object('advance_percent', _pct);
    NEW.supply_eta := CASE WHEN COALESCE(_pre->>'available_at','') ~ '^\d{4}-\d{2}-\d{2}$' THEN (_pre->>'available_at')::date ELSE NULL END;
    NEW.auto_release_at := NULL; -- jamais de libération automatique liée au délai
  ELSE
    NEW.fulfillment_type := 'disponible_localement';
    NEW.advance_mga := 0;
    NEW.preorder_snapshot := NULL;
    NEW.supply_eta := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER orders_apply_fulfillment
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.apply_order_fulfillment();

-- Plus aucune création directe de commande depuis l'application (uniquement les fonctions de paiement)
DROP POLICY IF EXISTS "client insert own order" ON public.orders;

-- Le client peut masquer sa commande (seul champ modifiable, contrôlé par le garde ci-dessous)
CREATE POLICY "order client hide" ON public.orders
  FOR UPDATE TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_order_direct_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _allowed text[];
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin') THEN RETURN NEW; END IF;
  IF auth.uid() = OLD.vendor_id THEN
    _allowed := ARRAY['updated_at','depart_at','eta_at','depart_city','courier_name','coop_name','shipping_mode','shipped_at','in_transit_at'];
    IF OLD.fulfillment_type <> 'sur_commande' THEN
      _allowed := _allowed || ARRAY['tracking_status','delivered_at'];
    END IF;
  ELSIF auth.uid() = OLD.client_id THEN
    _allowed := ARRAY['client_hidden','updated_at'];
  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF (to_jsonb(NEW) - _allowed) IS DISTINCT FROM (to_jsonb(OLD) - _allowed) THEN
    RAISE EXCEPTION 'Modification directe interdite : utilisez les actions sécurisées de la commande';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER orders_guard_direct_update
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_direct_update();

-- Journal : suivre aussi les étapes financières et d'approvisionnement
CREATE OR REPLACE FUNCTION public.log_order_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f text; o text; n text;
BEGIN
  FOREACH f IN ARRAY ARRAY['status','vendor_acceptance','tracking_status','depart_at','eta_at','depart_city','courier_name','coop_name','shipping_mode','delivery_fee_mga','shipping_address',
                           'supply_status','supply_eta','dispute_status','advance_released_mga','refunded_mga','buyer_confirmed_at','vendor_released'] LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f) INTO o, n USING OLD, NEW;
    IF o IS DISTINCT FROM n THEN
      INSERT INTO public.order_events(order_id, actor_id, field, old_value, new_value) VALUES (NEW.id, auth.uid(), f, o, n);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- ═════════ Libération du solde vendeur (unique) ═════════
CREATE OR REPLACE FUNCTION public._release_order(_order_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _amt bigint;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'order not found'; END IF;
  IF _o.vendor_released THEN RETURN; END IF;
  IF _o.dispute_status = 'ouvert' THEN RAISE EXCEPTION 'Litige en cours : libération bloquée'; END IF;
  _amt := GREATEST(_o.vendor_amount_mga - _o.advance_released_mga, 0);
  UPDATE public.wallets
     SET balance_pending_mga = GREATEST(0, balance_pending_mga - _amt),
         balance_mga = balance_mga + _amt,
         updated_at = now()
   WHERE user_id = _o.vendor_id;
  UPDATE public.orders
     SET vendor_released = true, released_at = now(), status = 'livre'
   WHERE id = _order_id;
  INSERT INTO public.wallet_transactions (user_id, type, amount_mga, reference_id, description)
    VALUES (_o.vendor_id, 'vendor_release', _amt, _order_id,
      CASE WHEN _o.advance_released_mga > 0 THEN 'Solde débloqué (avance déjà versée) : ' ELSE 'Débloqué: ' END || COALESCE(_reason,'auto'));
  INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (_o.vendor_id, 'Fonds débloqués 💰', _o.product_title, '/vendeur');
END $$;

CREATE OR REPLACE FUNCTION public.auto_release_orders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _r RECORD; _n INT := 0;
BEGIN
  FOR _r IN SELECT id FROM public.orders
    WHERE vendor_released = false AND auto_release_at IS NOT NULL AND auto_release_at < now()
      AND status NOT IN ('annule','rembourse')
      AND fulfillment_type <> 'sur_commande'
      AND dispute_status IS DISTINCT FROM 'ouvert'
  LOOP
    PERFORM public._release_order(_r.id, 'Auto 10j');
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END $$;

-- ═════════ Remboursement sécurisé (interne) ═════════
CREATE OR REPLACE FUNCTION public._refund_order(_order_id uuid, _clawback bigint, _reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _admin uuid; _held bigint; _claw bigint; _refund bigint; _vbal bigint;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.vendor_released OR _o.refunded_mga > 0 OR _o.status IN ('rembourse','annule') THEN
    RAISE EXCEPTION 'Commande déjà clôturée ou remboursée';
  END IF;
  _claw := LEAST(GREATEST(COALESCE(_clawback, 0), 0), _o.advance_released_mga);
  IF _claw > 0 THEN
    SELECT balance_mga INTO _vbal FROM public.wallets WHERE user_id = _o.vendor_id FOR UPDATE;
    IF COALESCE(_vbal, 0) < _claw THEN
      RAISE EXCEPTION 'Solde vendeur insuffisant pour restituer l''avance : arbitrage administrateur nécessaire';
    END IF;
    UPDATE public.wallets SET balance_mga = balance_mga - _claw, updated_at = now() WHERE user_id = _o.vendor_id;
  END IF;
  _held := GREATEST(_o.vendor_amount_mga - _o.advance_released_mga, 0);
  UPDATE public.wallets SET balance_pending_mga = GREATEST(0, balance_pending_mga - _held), updated_at = now() WHERE user_id = _o.vendor_id;
  SELECT user_id INTO _admin FROM public.user_roles WHERE role = 'admin' LIMIT 1;
  IF _admin IS NOT NULL AND _o.commission_mga > 0 THEN
    UPDATE public.wallets SET balance_commission_mga = GREATEST(0, balance_commission_mga - _o.commission_mga), updated_at = now() WHERE user_id = _admin;
    INSERT INTO public.wallet_transactions(user_id, type, amount_mga, reference_id, description)
      VALUES (_admin, 'remboursement', -_o.commission_mga, _order_id, 'Commission annulée : ' || _o.product_title);
  END IF;
  _refund := _o.total_mga - _o.advance_released_mga + _claw;
  UPDATE public.wallets
     SET balance_mga = balance_mga + _refund,
         balance_spent_mga = GREATEST(0, balance_spent_mga - _refund),
         updated_at = now()
   WHERE user_id = _o.client_id;
  UPDATE public.products SET stock = stock + _o.quantity, sold_count = GREATEST(0, sold_count - _o.quantity) WHERE id = _o.product_id;
  UPDATE public.orders
     SET status = 'rembourse', tracking_status = 'cancelled', vendor_released = true,
         refunded_mga = _refund, refunded_at = now(), updated_at = now()
   WHERE id = _order_id;
  INSERT INTO public.wallet_transactions(user_id, type, amount_mga, reference_id, description) VALUES
    (_o.client_id, 'remboursement', _refund, _order_id, 'Remboursement (' || COALESCE(_reason,'annulation') || ') : ' || _o.product_title),
    (_o.vendor_id, 'remboursement', -(_held + _claw), _order_id, 'Commande annulée (' || COALESCE(_reason,'annulation') || ') : ' || _o.product_title);
  RETURN _refund;
END $$;

-- ═════════ Décision vendeur (avance versée à l'acceptation) ═════════
CREATE OR REPLACE FUNCTION public.vendor_decide_order(_order_id uuid, _accept boolean, _reason text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _admin uuid;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _o.vendor_acceptance <> 'en_attente' THEN RAISE EXCEPTION 'Décision déjà prise'; END IF;
  IF _accept THEN
    UPDATE public.orders SET vendor_acceptance='accepte', vendor_decided_at=now(), updated_at=now() WHERE id=_order_id;
    IF _o.fulfillment_type = 'sur_commande' AND _o.advance_mga > 0 AND _o.advance_released_mga = 0 AND _o.status = 'paye' AND NOT _o.vendor_released THEN
      UPDATE public.wallets
         SET balance_pending_mga = GREATEST(0, balance_pending_mga - _o.advance_mga),
             balance_mga = balance_mga + _o.advance_mga,
             updated_at = now()
       WHERE user_id = _o.vendor_id;
      UPDATE public.orders
         SET advance_released_mga = _o.advance_mga, advance_released_at = now(),
             supply_history = supply_history || jsonb_build_array(jsonb_build_object('status','avance_versee','at',now(),'note','Avance vendeur versée'))
       WHERE id = _order_id;
      INSERT INTO public.wallet_transactions(user_id, type, amount_mga, reference_id, description)
        VALUES (_o.vendor_id, 'vendor_release', _o.advance_mga, _order_id, 'Avance (produit sur commande) : ' || _o.product_title);
      INSERT INTO public.notifications(user_id, title, body, link)
        VALUES (_o.vendor_id, 'Avance versée 💰', _o.product_title || ' — le reste est conservé jusqu''à la confirmation de réception.', '/vendeur');
    END IF;
    INSERT INTO public.notifications(user_id,title,body,link) VALUES (_o.client_id,'Commande acceptée ✅', _o.product_title || ' — votre facture est disponible.', '/client');
  ELSE
    UPDATE public.orders SET vendor_acceptance='refuse', vendor_decided_at=now(), vendor_refusal_reason=left(_reason,500),
      status='rembourse', tracking_status='cancelled', vendor_released=true, refunded_mga=_o.total_mga, refunded_at=now(), updated_at=now() WHERE id=_order_id;
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

-- ═════════ Confirmation de réception (idempotente) ═════════
CREATE OR REPLACE FUNCTION public.confirm_delivery(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.client_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _o.vendor_released THEN
    IF _o.buyer_confirmed_at IS NOT NULL THEN RETURN; END IF; -- déjà confirmé : aucun second crédit
    RAISE EXCEPTION 'already released';
  END IF;
  IF _o.vendor_acceptance <> 'accepte' THEN RAISE EXCEPTION 'La commande n''a pas encore été acceptée par le vendeur'; END IF;
  IF _o.dispute_status = 'ouvert' THEN RAISE EXCEPTION 'Litige en cours : confirmation impossible'; END IF;
  IF _o.fulfillment_type = 'sur_commande' AND NOT (_o.tracking_status = 'delivered' OR _o.status = 'livre') THEN
    RAISE EXCEPTION 'La réception ne peut être confirmée qu''après la livraison du produit';
  END IF;
  UPDATE public.orders SET buyer_confirmed_at = now() WHERE id = _order_id;
  PERFORM public._release_order(_order_id, 'Confirmation client');
END $$;

-- ═════════ Approvisionnement (vendeur) ═════════
CREATE OR REPLACE FUNCTION public.vendor_update_supply(_order_id uuid, _status text DEFAULT NULL, _eta date DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _steps text[] := ARRAY['commande_fournisseur','approvisionnement','arrive_madagascar','pret_expedition'];
        _rn int; _ro int; _label text;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _o.fulfillment_type <> 'sur_commande' THEN RAISE EXCEPTION 'Réservé aux produits sur commande'; END IF;
  IF _o.vendor_acceptance <> 'accepte' THEN RAISE EXCEPTION 'Acceptez d''abord la commande'; END IF;
  IF _o.vendor_released OR _o.status IN ('rembourse','annule','livre') THEN RAISE EXCEPTION 'Commande clôturée'; END IF;
  IF _status IS NULL AND _eta IS NULL THEN RAISE EXCEPTION 'Rien à mettre à jour'; END IF;
  IF _status IS NOT NULL THEN
    _rn := array_position(_steps, _status);
    IF _rn IS NULL THEN RAISE EXCEPTION 'Statut d''approvisionnement invalide'; END IF;
    _ro := COALESCE(array_position(_steps, _o.supply_status), 0);
    IF _rn < _ro THEN RAISE EXCEPTION 'Impossible de revenir à une étape précédente'; END IF;
    IF _o.tracking_status IN ('shipped','in_transit','nearby','at_depot','delivered') THEN RAISE EXCEPTION 'Colis déjà expédié'; END IF;
  END IF;
  IF _eta IS NOT NULL AND _eta < current_date THEN RAISE EXCEPTION 'La date estimée doit être aujourd''hui ou plus tard'; END IF;
  UPDATE public.orders
     SET supply_status = COALESCE(_status, supply_status),
         supply_eta = COALESCE(_eta, supply_eta),
         supply_history = supply_history || jsonb_build_array(jsonb_build_object(
           'status', COALESCE(_status, 'eta_update'), 'eta', _eta, 'note', left(_note, 300), 'at', now())),
         updated_at = now()
   WHERE id = _order_id;
  _label := CASE COALESCE(_status, 'eta_update')
    WHEN 'commande_fournisseur' THEN '🧾 Commande fournisseur effectuée'
    WHEN 'approvisionnement' THEN '🚢 Approvisionnement en cours'
    WHEN 'arrive_madagascar' THEN '🇲🇬 Produit arrivé à Madagascar'
    WHEN 'pret_expedition' THEN '📦 Produit prêt à être expédié'
    ELSE '📅 Nouvelle date estimée' END;
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (_o.client_id, _label, _o.product_title || COALESCE(' — estimation : ' || to_char(COALESCE(_eta, _o.supply_eta), 'DD/MM/YYYY'), ''), '/client');
END $$;

-- ═════════ Expédition : sur commande uniquement après arrivée du produit ═════════
CREATE OR REPLACE FUNCTION public.vendor_ship_order(_order_id uuid, _mode text, _courier text, _coop text, _depart_city text, _depart_at timestamp with time zone, _days_min integer, _days_max integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o RECORD; _eta timestamptz;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id=_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF _o.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _o.fulfillment_type = 'sur_commande' AND (_o.vendor_acceptance <> 'accepte' OR COALESCE(_o.supply_status,'') NOT IN ('arrive_madagascar','pret_expedition') OR _o.vendor_released) THEN
    RAISE EXCEPTION 'Indiquez d''abord que le produit est arrivé ou prêt à expédier';
  END IF;
  _eta := COALESCE(_depart_at, now()) + (COALESCE(_days_max, 5) || ' days')::interval;
  UPDATE public.orders SET
    status = 'expedie', tracking_status = 'shipped', shipping_mode = _mode, courier_name = _courier, coop_name = _coop,
    depart_city = _depart_city, depart_at = COALESCE(_depart_at, now()), eta_at = _eta,
    delivery_days_min = COALESCE(_days_min, delivery_days_min), delivery_days_max = COALESCE(_days_max, delivery_days_max),
    shipped_at = now()
   WHERE id = _order_id;
  INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (_o.client_id, 'Colis expédié 🚚', _o.product_title, '/order/' || _order_id || '/tracking');
END $$;

CREATE OR REPLACE FUNCTION public.vendor_set_tracking(_order_id uuid, _status text, _depart_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _eta_at timestamp with time zone DEFAULT NULL::timestamp with time zone, _depart_city text DEFAULT NULL::text, _courier text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o RECORD; _label text;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id=_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF _o.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('prepared','shipped','in_transit','nearby','at_depot','delivered','cancelled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF _o.fulfillment_type = 'sur_commande' THEN
    IF _status = 'cancelled' THEN RAISE EXCEPTION 'Produit sur commande : utilisez « Annuler et rembourser »'; END IF;
    IF _o.vendor_acceptance <> 'accepte' OR COALESCE(_o.supply_status,'') NOT IN ('arrive_madagascar','pret_expedition') OR _o.vendor_released THEN
      RAISE EXCEPTION 'Indiquez d''abord que le produit est arrivé ou prêt à expédier';
    END IF;
  END IF;
  UPDATE public.orders SET
    tracking_status = _status,
    depart_at = CASE WHEN _status='shipped' THEN COALESCE(_depart_at, depart_at, now()) ELSE COALESCE(_depart_at, depart_at) END,
    eta_at = COALESCE(_eta_at, eta_at),
    depart_city = COALESCE(_depart_city, depart_city),
    courier_name = COALESCE(_courier, courier_name),
    shipped_at = CASE WHEN _status='shipped' THEN COALESCE(shipped_at, now()) ELSE shipped_at END,
    in_transit_at = CASE WHEN _status='in_transit' THEN COALESCE(in_transit_at, now()) ELSE in_transit_at END,
    delivered_at = CASE WHEN _status='delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
    status = CASE WHEN _status='delivered' THEN 'livre'::order_status
                  WHEN _status IN ('shipped','in_transit','nearby','at_depot') THEN 'expedie'::order_status
                  WHEN _status='cancelled' THEN 'annule'::order_status
                  ELSE status END,
    updated_at = now()
   WHERE id=_order_id;
  _label := CASE _status
    WHEN 'prepared' THEN '📦 Colis préparé'
    WHEN 'shipped' THEN '🚚 Départ'
    WHEN 'in_transit' THEN '🛣 En route'
    WHEN 'nearby' THEN '📍 À proximité'
    WHEN 'at_depot' THEN '🏢 En dépôt'
    WHEN 'delivered' THEN '🏠 Livré'
    ELSE '❌ Livraison annulée' END;
  INSERT INTO public.notifications (user_id, title, body, link)
  VALUES (_o.client_id, _label, _o.product_title, '/order/' || _order_id || '/tracking');
END $$;

CREATE OR REPLACE FUNCTION public.vendor_mark_in_transit(_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o RECORD;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id=_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF _o.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _o.fulfillment_type = 'sur_commande' AND (_o.vendor_acceptance <> 'accepte' OR COALESCE(_o.supply_status,'') NOT IN ('arrive_madagascar','pret_expedition') OR _o.vendor_released) THEN
    RAISE EXCEPTION 'Indiquez d''abord que le produit est arrivé ou prêt à expédier';
  END IF;
  UPDATE public.orders SET tracking_status='in_transit', in_transit_at=now() WHERE id=_order_id;
  INSERT INTO public.notifications (user_id, title, body, link)
    VALUES (_o.client_id, 'Colis en route 📦', _o.product_title, '/order/' || _order_id || '/tracking');
END $$;

-- ═════════ Annulations ═════════
CREATE OR REPLACE FUNCTION public.client_cancel_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _r bigint;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.client_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _o.fulfillment_type <> 'sur_commande' THEN RAISE EXCEPTION 'Annulation directe réservée aux produits sur commande'; END IF;
  IF _o.vendor_acceptance <> 'en_attente' THEN RAISE EXCEPTION 'Commande déjà acceptée : ouvrez un litige'; END IF;
  UPDATE public.orders SET vendor_acceptance = 'annule_client', vendor_decided_at = now(),
         vendor_refusal_reason = left('Annulée par le client' || COALESCE(' : ' || _reason, ''), 500)
   WHERE id = _order_id;
  _r := public._refund_order(_order_id, 0, 'annulation client');
  INSERT INTO public.notifications(user_id, title, body, link) VALUES
    (_o.vendor_id, 'Commande annulée par le client', _o.product_title, '/vendeur'),
    (_o.client_id, 'Commande annulée ✅', _o.product_title || ' — montant remboursé sur votre wallet.', '/client');
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.vendor_cancel_preorder(_order_id uuid, _reason text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _r bigint;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.vendor_id <> auth.uid() THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _o.fulfillment_type <> 'sur_commande' THEN RAISE EXCEPTION 'Réservé aux produits sur commande'; END IF;
  IF _o.vendor_acceptance <> 'accepte' THEN RAISE EXCEPTION 'Commande non acceptée : utilisez « Refuser »'; END IF;
  IF _o.tracking_status IN ('shipped','in_transit','nearby','at_depot','delivered') THEN RAISE EXCEPTION 'Colis déjà expédié : ouvrez un litige'; END IF;
  IF length(trim(COALESCE(_reason,''))) < 5 THEN RAISE EXCEPTION 'Indiquez le motif (5 caractères min.)'; END IF;
  UPDATE public.orders SET vendor_refusal_reason = left('Annulée par le vendeur : ' || trim(_reason), 500) WHERE id = _order_id;
  _r := public._refund_order(_order_id, _o.advance_released_mga, 'annulation vendeur');
  INSERT INTO public.notifications(user_id, title, body, link) VALUES
    (_o.client_id, 'Commande annulée par le vendeur', _o.product_title || ' — ' || trim(_reason) || '. Montant remboursé sur votre wallet.', '/client');
  RETURN _r;
END $$;

-- ═════════ Litiges ═════════
CREATE OR REPLACE FUNCTION public.open_order_dispute(_order_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _admin uuid; _other uuid;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF auth.uid() IS NULL OR auth.uid() NOT IN (_o.client_id, _o.vendor_id) THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _o.fulfillment_type <> 'sur_commande' THEN RAISE EXCEPTION 'Pour cette commande, contactez le support'; END IF;
  IF _o.vendor_acceptance <> 'accepte' THEN RAISE EXCEPTION 'Commande non acceptée'; END IF;
  IF _o.vendor_released OR _o.refunded_mga > 0 THEN RAISE EXCEPTION 'Commande déjà clôturée'; END IF;
  IF _o.dispute_status = 'ouvert' THEN RAISE EXCEPTION 'Un litige est déjà ouvert'; END IF;
  IF length(trim(COALESCE(_reason,''))) < 5 THEN RAISE EXCEPTION 'Décrivez le problème (5 caractères min.)'; END IF;
  UPDATE public.orders SET dispute_status = 'ouvert', dispute_reason = left(trim(_reason), 1000),
         dispute_opened_by = auth.uid(), dispute_opened_at = now(), dispute_resolution = NULL, updated_at = now()
   WHERE id = _order_id;
  _other := CASE WHEN auth.uid() = _o.client_id THEN _o.vendor_id ELSE _o.client_id END;
  INSERT INTO public.notifications(user_id, title, body, link)
    VALUES (_other, 'Litige ouvert ⚠️', _o.product_title || ' — ' || left(trim(_reason), 200), CASE WHEN _other = _o.vendor_id THEN '/vendeur' ELSE '/client' END);
  FOR _admin IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications(user_id, title, body, link) VALUES (_admin, 'Nouveau litige ⚠️', _o.product_title, '/admin');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_order_dispute(_order_id uuid, _decision text, _clawback bigint DEFAULT 0, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _o public.orders; _r bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  SELECT * INTO _o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF _o.dispute_status IS DISTINCT FROM 'ouvert' THEN RAISE EXCEPTION 'Aucun litige ouvert'; END IF;
  IF _decision = 'liberer_vendeur' THEN
    UPDATE public.orders SET dispute_status = 'resolu', dispute_resolution = left('Solde libéré au vendeur' || COALESCE(' — ' || _note, ''), 1000) WHERE id = _order_id;
    PERFORM public._release_order(_order_id, 'Arbitrage administrateur');
    INSERT INTO public.notifications(user_id, title, body, link) VALUES
      (_o.client_id, 'Litige clôturé', _o.product_title || ' — solde versé au vendeur.', '/client'),
      (_o.vendor_id, 'Litige clôturé', _o.product_title || ' — solde débloqué.', '/vendeur');
  ELSIF _decision = 'rembourser_client' THEN
    UPDATE public.orders SET dispute_status = 'resolu', dispute_resolution = left('Client remboursé' || COALESCE(' — ' || _note, ''), 1000) WHERE id = _order_id;
    _r := public._refund_order(_order_id, _clawback, 'arbitrage administrateur');
    INSERT INTO public.notifications(user_id, title, body, link) VALUES
      (_o.client_id, 'Litige clôturé', _o.product_title || ' — ' || _r || ' Ar remboursés sur votre wallet.', '/client'),
      (_o.vendor_id, 'Litige clôturé', _o.product_title || ' — commande remboursée au client.', '/vendeur');
  ELSE
    RAISE EXCEPTION 'Décision invalide';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_max_advance(_pct numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Accès refusé'; END IF;
  IF _pct IS NULL OR _pct < 0 OR _pct > 100 THEN RAISE EXCEPTION 'Valeur invalide (0 à 100)'; END IF;
  UPDATE public.app_settings SET max_advance_percent = _pct, updated_at = now() WHERE id = 1;
END $$;

-- ═════════ Droits d'exécution ═════════
REVOKE ALL ON FUNCTION public._refund_order(uuid, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._release_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_release_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._refund_order(uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public._release_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_release_orders() TO service_role;

REVOKE ALL ON FUNCTION public.vendor_update_supply(uuid, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.client_cancel_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vendor_cancel_preorder(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_order_dispute(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_order_dispute(uuid, text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_max_advance(numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_delivery(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vendor_decide_order(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vendor_ship_order(uuid, text, text, text, text, timestamptz, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vendor_set_tracking(uuid, text, timestamptz, timestamptz, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.vendor_mark_in_transit(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_update_supply(uuid, text, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.client_cancel_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_cancel_preorder(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_order_dispute(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_resolve_order_dispute(uuid, text, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_max_advance(numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_delivery(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_decide_order(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_ship_order(uuid, text, text, text, text, timestamptz, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_set_tracking(uuid, text, timestamptz, timestamptz, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vendor_mark_in_transit(uuid) TO authenticated, service_role;