import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type QuoteInput = {
  vendor_lat: number;
  vendor_lng: number;
  client_lat: number;
  client_lng: number;
  /** Flat fee set manually by the vendor (MGA). GPS is used only for the km/route estimate. */
  base_mga: number;
  /** @deprecated kept for backward compat, no longer used to compute the price. */
  per_km_mga?: number;
};

// Return the vendor's manual flat fee. GPS is used ONLY for distance/duration display and ETA,
// never to compute the price anymore (see product spec: "Supprimer le calcul automatique basé sur les km").
const isLat = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
const isLng = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;

export const getShippingQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: QuoteInput) => {
    if (!isLat(d?.vendor_lat) || !isLng(d?.vendor_lng) || !isLat(d?.client_lat) || !isLng(d?.client_lng)) {
      throw new Error("Invalid coordinates");
    }
    const base = Number(d?.base_mga);
    if (!Number.isFinite(base) || base < 0 || base > 100_000_000) {
      throw new Error("Invalid fee");
    }
    return { vendor_lat: d.vendor_lat, vendor_lng: d.vendor_lng, client_lat: d.client_lat, client_lng: d.client_lng, base_mga: base };
  })
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

    const haversine = () => {
      const R = 6371;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(data.client_lat - data.vendor_lat);
      const dLng = toRad(data.client_lng - data.vendor_lng);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(data.vendor_lat)) * Math.cos(toRad(data.client_lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(a));
    };

    const buildResult = (km: number, durationMin: number | null, source: string) => {
      // Flat fee — no km multiplier.
      const fee = Math.max(0, Math.round(data.base_mga));
      const daysMin = km < 30 ? 1 : km < 150 ? 2 : km < 500 ? 4 : 6;
      const daysMax = daysMin + 2;
      return {
        km: Math.round(km * 10) / 10,
        fee_mga: fee,
        duration_min: durationMin,
        days_min: daysMin,
        days_max: daysMax,
        source,
      };
    };

    if (!lovableKey || !mapsKey) {
      return buildResult(haversine(), null, "haversine");
    }

    try {
      const res = await fetch(
        "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": mapsKey,
            "Content-Type": "application/json",
            "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: data.vendor_lat, longitude: data.vendor_lng } } },
            destination: { location: { latLng: { latitude: data.client_lat, longitude: data.client_lng } } },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE",
          }),
        },
      );
      if (!res.ok) {
        console.error("Routes API", res.status, await res.text());
        return buildResult(haversine(), null, "haversine_fallback");
      }
      const j: any = await res.json();
      const route = j?.routes?.[0];
      const meters = route?.distanceMeters;
      const durStr = route?.duration as string | undefined;
      const seconds = durStr ? parseInt(durStr.replace("s", ""), 10) : null;
      if (!meters) return buildResult(haversine(), null, "haversine_no_route");
      return buildResult(meters / 1000, seconds ? Math.round(seconds / 60) : null, "routes_api");
    } catch (e) {
      console.error("getShippingQuote error", e);
      return buildResult(haversine(), null, "haversine_error");
    }
  });
