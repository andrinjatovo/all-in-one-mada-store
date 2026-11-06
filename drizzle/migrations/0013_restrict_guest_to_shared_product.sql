REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.categories FROM anon;
REVOKE SELECT ON public.vendor_profiles FROM anon;
DROP POLICY IF EXISTS "anon read active vendors" ON public.vendor_profiles;
REVOKE EXECUTE ON FUNCTION public.feed_products(text, uuid, text, bigint, bigint, integer, integer) FROM anon;

-- Visitors may open only the single product named in a shared link.
CREATE OR REPLACE FUNCTION public.get_shared_product(_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'product', to_jsonb(p) - 'cost_price' ,
    'vendor', jsonb_build_object('id', v.id, 'shop_name', v.shop_name, 'logo_url', v.logo_url,
      'description', v.description, 'created_at', v.created_at, 'rating_avg', v.rating_avg, 'rating_count', v.rating_count)
  )
  FROM public.products p
  LEFT JOIN public.vendor_profiles v ON v.id = p.vendor_id AND v.status = 'actif'
  WHERE p.id = _id AND p.is_active = true
$$;
REVOKE ALL ON FUNCTION public.get_shared_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_product(uuid) TO anon, authenticated;