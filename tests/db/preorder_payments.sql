-- Scénarios « produit sur commande » : exécutés dans un bloc qui se termine
-- TOUJOURS par une exception => aucune donnée n'est conservée.
-- Résultat lisible dans le message d'erreur final (PASS/FAIL par règle).
DO $$
DECLARE
  _client uuid := 'c020aef2-8796-434d-9572-5447e7de0f28';
  _other  uuid := '50aa246a-d2bc-468c-8d67-2ef6689a0757';
  _vendor uuid := 'cc7a85f4-03dd-4a33-9252-c5a503e4b204';
  _admin  uuid := '293f0731-7113-46df-bdbd-379811daa0f7';
  _prod   uuid := 'ea268712-b73d-49fc-a06f-81000096d52b';
  _o uuid; _o2 uuid; _o3 uuid; _o4 uuid;
  _r public.orders;
  _vb0 bigint; _vb1 bigint; _vb2 bigint; _cb0 bigint; _cb1 bigint; _n int;
  _log text := '';
  PROCEDURE_ok boolean;
BEGIN
  DELETE FROM public.coupons WHERE user_id = _client; -- coupons hors scénario (rollback final)
  UPDATE public.wallets SET balance_mga = 1000000 WHERE user_id = _client;

  -- R1 : avance au-delà du maximum admin refusée
  BEGIN
    UPDATE public.products SET availability='sur_commande', advance_percent=50,
      preorder='{"origin_country":"Chine","available_at":"2099-01-01","supply_days":"20","prep_days":"2","delivery_days":"3"}' WHERE id=_prod;
    _log := _log || 'FAIL R1 avance>max acceptée; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R1; ';
  END;
  -- R2 : formulaire sur commande obligatoire
  BEGIN
    UPDATE public.products SET availability='sur_commande', advance_percent=10, preorder='{}' WHERE id=_prod;
    _log := _log || 'FAIL R2 sans infos; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R2; ';
  END;
  UPDATE public.products SET availability='sur_commande', advance_percent=30, price_mga=100000, discount_percent=0,
    variants='[]'::jsonb,
    preorder='{"origin_country":"Chine","available_at":"2099-01-01","supply_days":"20","prep_days":"2","delivery_days":"3"}' WHERE id=_prod;

  -- Commande 1 : flux complet
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _client, 'role', 'authenticated')::text, true);
  _o := public.place_order_v3(_prod, 1, 'Test', NULL, 0, NULL, NULL, NULL, NULL);
  SELECT * INTO _r FROM public.orders WHERE id=_o;
  _log := _log || CASE WHEN _r.fulfillment_type='sur_commande' AND _r.total_mga=100000 AND _r.advance_mga=30000 AND _r.auto_release_at IS NULL
                       THEN 'PASS R3 avance 30000/100000; ' ELSE 'FAIL R3 '||_r.advance_mga||'/'||_r.total_mga||'; ' END;

  BEGIN PERFORM public.confirm_delivery(_o); _log := _log || 'FAIL R4 confirmation avant acceptation; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R4; '; END;

  SELECT balance_mga INTO _vb0 FROM public.wallets WHERE user_id=_vendor;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _vendor, 'role', 'authenticated')::text, true);
  PERFORM public.vendor_decide_order(_o, true, NULL);
  SELECT balance_mga INTO _vb1 FROM public.wallets WHERE user_id=_vendor;
  _log := _log || CASE WHEN _vb1 - _vb0 = 30000 THEN 'PASS R5 avance versée; ' ELSE 'FAIL R5 '||(_vb1-_vb0)||'; ' END;

  BEGIN PERFORM public.vendor_set_tracking(_o, 'delivered'); _log := _log || 'FAIL R6 livré sans approvisionnement; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R6; '; END;

  -- R7 : le vendeur ne peut pas modifier les montants directement
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.orders SET vendor_amount_mga = 999999 WHERE id=_o;
    GET DIAGNOSTICS _n = ROW_COUNT;
    EXECUTE 'RESET ROLE';
    _log := _log || 'FAIL R7 modification directe ('||_n||'); ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R7; ';
  END;
  EXECUTE 'RESET ROLE';
  -- R8 : le vendeur ne peut pas libérer lui-même le solde
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public._release_order(_o, 'triche');
    EXECUTE 'RESET ROLE';
    _log := _log || 'FAIL R8 libération par le vendeur; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R8; ';
  END;
  EXECUTE 'RESET ROLE';

  PERFORM public.vendor_update_supply(_o, 'commande_fournisseur', NULL, NULL);
  PERFORM public.vendor_update_supply(_o, 'pret_expedition', (current_date + 5), 'ok');
  PERFORM public.vendor_set_tracking(_o, 'delivered');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _other, 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.confirm_delivery(_o); _log := _log || 'FAIL R9 autre client; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R9; '; END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', _client, 'role', 'authenticated')::text, true);
  SELECT * INTO _r FROM public.orders WHERE id=_o;
  PERFORM public.confirm_delivery(_o);
  PERFORM public.confirm_delivery(_o); -- double pression
  SELECT balance_mga INTO _vb2 FROM public.wallets WHERE user_id=_vendor;
  _log := _log || CASE WHEN _vb2 - _vb1 = _r.vendor_amount_mga - 30000 THEN 'PASS R10 solde libéré une seule fois ('||(_vb2-_vb1)||'); ' ELSE 'FAIL R10 '||(_vb2-_vb1)||'; ' END;
  SELECT count(*) INTO _n FROM public.wallet_transactions WHERE reference_id=_o AND type='vendor_release';
  _log := _log || CASE WHEN _n = 2 THEN 'PASS R11 2 opérations (avance+solde); ' ELSE 'FAIL R11 '||_n||'; ' END;

  -- Commande 2 : annulation client avant acceptation => remboursement total
  SELECT balance_mga INTO _cb0 FROM public.wallets WHERE user_id=_client;
  _o2 := public.place_order_v3(_prod, 1, 'Test', NULL, 0, NULL, NULL, NULL, NULL);
  PERFORM public.client_cancel_order(_o2, 'test');
  SELECT balance_mga INTO _cb1 FROM public.wallets WHERE user_id=_client;
  _log := _log || CASE WHEN _cb1 = _cb0 THEN 'PASS R12 annulation client; ' ELSE 'FAIL R12 '||(_cb1-_cb0)||'; ' END;
  BEGIN PERFORM public.client_cancel_order(_o2, 'x'); _log := _log || 'FAIL R13 double remboursement; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R13; '; END;

  -- Commande 3 : vendeur annule après avance => avance restituée, client remboursé à 100 %
  _o3 := public.place_order_v3(_prod, 1, 'Test', NULL, 0, NULL, NULL, NULL, NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _vendor, 'role', 'authenticated')::text, true);
  SELECT balance_mga INTO _vb0 FROM public.wallets WHERE user_id=_vendor;
  PERFORM public.vendor_decide_order(_o3, true, NULL);
  PERFORM public.vendor_cancel_preorder(_o3, 'fournisseur indisponible');
  SELECT balance_mga INTO _vb1 FROM public.wallets WHERE user_id=_vendor;
  SELECT balance_mga INTO _cb1 FROM public.wallets WHERE user_id=_client;
  _log := _log || CASE WHEN _vb1 = _vb0 AND _cb1 = _cb0 THEN 'PASS R14 annulation vendeur; ' ELSE 'FAIL R14 v'||(_vb1-_vb0)||' c'||(_cb1-_cb0)||'; ' END;

  -- Commande 4 : litige => confirmation bloquée, arbitrage admin rembourse le solde protégé
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _client, 'role', 'authenticated')::text, true);
  _o4 := public.place_order_v3(_prod, 1, 'Test', NULL, 0, NULL, NULL, NULL, NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _vendor, 'role', 'authenticated')::text, true);
  PERFORM public.vendor_decide_order(_o4, true, NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _client, 'role', 'authenticated')::text, true);
  PERFORM public.open_order_dispute(_o4, 'Produit jamais arrivé');
  BEGIN PERFORM public.admin_resolve_order_dispute(_o4, 'rembourser_client', 0, NULL); _log := _log || 'FAIL R15 client arbitre; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R15; '; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  PERFORM public.admin_resolve_order_dispute(_o4, 'rembourser_client', 0, 'test');
  SELECT balance_mga INTO _cb1 FROM public.wallets WHERE user_id=_client;
  _log := _log || CASE WHEN _cb0 - _cb1 = 30000 THEN 'PASS R16 solde protégé remboursé (avance conservée par le vendeur); ' ELSE 'FAIL R16 '||(_cb0-_cb1)||'; ' END;
  BEGIN PERFORM public.admin_resolve_order_dispute(_o4, 'liberer_vendeur', 0, NULL); _log := _log || 'FAIL R17 double arbitrage; ';
  EXCEPTION WHEN OTHERS THEN _log := _log || 'PASS R17; '; END;

  RAISE EXCEPTION 'TEST_RESULT %', _log;
END $$;
