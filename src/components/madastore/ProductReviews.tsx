import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, Flag, Star, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { compressImage, uploadToBucket } from "@/lib/upload";
import { Button } from "@/components/ui/button";

type Review = { id: string; user_id: string; rating: number; content: string; images: string[]; is_verified_purchase: boolean; created_at: string };

export function Stars({ value, count }: { value: number; count?: number }) {
  return <span className="inline-flex items-center gap-1 text-sm" aria-label={`${value} étoiles sur 5`}><Star className="fill-mada-red text-mada-red" /> <strong>{Number(value).toFixed(1)}</strong>{typeof count === "number" && <span className="text-muted-foreground">({count} avis)</span>}</span>;
}

export function ProductReviews({ productId, vendorId, userId, ratingAvg, ratingCount, onPublished }: { productId: string; vendorId: string; userId?: string; ratingAvg: number; ratingCount: number; onPublished: () => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const { data } = await supabase.from("product_reviews").select("id,user_id,rating,content,images,is_verified_purchase,created_at").eq("product_id", productId).order("created_at", { ascending: false });
    const rows = (data ?? []) as Review[];
    setReviews(rows);
    const paths = rows.flatMap((review) => review.images ?? []);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("reviews").createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      signed?.forEach((item, index) => { if (item.signedUrl) map[paths[index]] = item.signedUrl; });
      setPhotoUrls(map);
    }
    if (userId) {
      const { data: eligible } = await supabase.from("orders").select("id").eq("client_id", userId).eq("product_id", productId).or("status.eq.livre,buyer_confirmed_at.not.is.null,tracking_status.eq.delivered").order("created_at", { ascending: false }).limit(1).maybeSingle();
      setOrderId(eligible?.id ?? null);
    }
  }

  useEffect(() => { load(); }, [productId, userId]);
  const alreadyReviewed = useMemo(() => reviews.some((review) => review.user_id === userId), [reviews, userId]);

  async function publish() {
    if (!userId || !orderId || alreadyReviewed) return;
    if (content.trim().length < 2) return toast.error("Ajoutez un commentaire à votre avis");
    setSubmitting(true);
    const paths: string[] = [];
    try {
      for (const [index, original] of files.slice(0, 4).entries()) {
        const file = await compressImage(original);
        const path = `${userId}/${productId}/${Date.now()}-${index}.jpg`;
        await uploadToBucket("reviews", path, file);
        paths.push(path);
      }
      const { error } = await supabase.from("product_reviews").insert({ product_id: productId, vendor_id: vendorId, user_id: userId, order_id: orderId, rating, content: content.trim(), images: paths });
      if (error) throw error;
      setContent(""); setFiles([]);
      toast.success("Votre avis vérifié est publié");
      await load(); onPublished();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Avis non publié"); }
    finally { setSubmitting(false); }
  }

  async function report(reviewId: string) {
    if (!userId) return toast.error("Connectez-vous pour signaler cet avis");
    const reason = window.prompt("Pourquoi signalez-vous cet avis ?");
    if (!reason?.trim()) return;
    const { error } = await supabase.from("review_reports").insert({ review_id: reviewId, reporter_id: userId, reason: reason.trim().slice(0, 500) });
    if (error?.code === "23505") return toast.info("Vous avez déjà signalé cet avis");
    if (error) return toast.error(error.message);
    toast.success("Signalement transmis à l’administration");
  }

  return (
    <section className="space-y-4 border-t border-border pt-5" aria-labelledby="reviews-title">
      <div className="flex items-center justify-between gap-3"><div><h2 id="reviews-title" className="text-lg font-black">Avis clients</h2><Stars value={ratingAvg} count={ratingCount} /></div></div>
      {userId && orderId && !alreadyReviewed && (
        <div className="space-y-3 rounded-md border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 className="text-mada-green" /> Donner un avis sur votre achat reçu</div>
          <div className="flex gap-1" aria-label="Choisir une note">{[1,2,3,4,5].map((value) => <Button type="button" key={value} variant="ghost" size="icon" onClick={() => setRating(value)} aria-label={`${value} étoile${value > 1 ? "s" : ""}`}><Star className={value <= rating ? "fill-mada-red text-mada-red" : "text-muted-foreground"} /></Button>)}</div>
          <textarea value={content} onChange={(event) => setContent(event.target.value)} maxLength={2000} rows={3} placeholder="Décrivez le produit reçu…" className="w-full resize-none rounded-md border border-input bg-background p-3 text-sm" />
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input px-3 text-sm font-medium"><Camera className="h-4 w-4" /> Photos ({files.length}/4)<input type="file" accept="image/*" multiple className="hidden" onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 4))} /></label>
            {files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-40 items-center gap-1 truncate rounded-full bg-muted px-2 py-1 text-xs">{file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} aria-label="Retirer cette photo"><X className="h-3 w-3" /></button></span>)}
          </div>
          <Button type="button" onClick={publish} disabled={submitting}>{submitting ? "Publication…" : "Publier mon avis"}</Button>
        </div>
      )}
      {reviews.length === 0 ? <p className="text-sm text-muted-foreground">Aucun avis pour le moment.</p> : reviews.map((review) => (
        <article key={review.id} className="space-y-2 rounded-md border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3"><div><Stars value={review.rating} /><div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">Client {review.user_id.slice(0, 6)} · {new Date(review.created_at).toLocaleDateString("fr-FR")}{review.is_verified_purchase && <span className="inline-flex items-center gap-1 font-bold text-mada-green"><CheckCircle2 className="h-3 w-3" /> Achat vérifié</span>}</div></div><Button type="button" variant="ghost" size="icon" onClick={() => report(review.id)} aria-label="Signaler cet avis"><Flag /></Button></div>
          <p className="whitespace-pre-wrap text-sm">{review.content}</p>
          {!!review.images?.length && <div className="flex gap-2 overflow-x-auto">{review.images.map((path) => photoUrls[path] ? <a key={path} href={photoUrls[path]} target="_blank" rel="noreferrer"><img src={photoUrls[path]} alt="Photo ajoutée à l’avis" className="h-24 w-24 rounded-md object-cover" /></a> : null)}</div>}
        </article>
      ))}
    </section>
  );
}