import { useState } from "react";
import { Copy, Facebook, MoreHorizontal, Send, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ProductShare({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.href;

  async function nativeShare() {
    if (navigator.share) {
      try { await navigator.share({ title, text: title, url }); return; } catch { return; }
    }
    setOpen(true);
  }

  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("Lien du produit copié");
    setOpen(false);
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(title);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={nativeShare}><Share2 /> Partager</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/75" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-t-md border border-border bg-card p-5" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Partager ce produit">
            <div className="mb-4 flex items-center justify-between"><h2 className="font-black">Partager ce produit</h2><Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fermer"><X /></Button></div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={copy}><Copy /> Copier le lien</Button>
              <Button asChild variant="outline"><a href={`https://wa.me/?text=${encodedText}%20${encodedUrl}`} target="_blank" rel="noreferrer"><Send /> WhatsApp</a></Button>
              <Button asChild variant="outline"><a href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} target="_blank" rel="noreferrer"><Facebook /> Facebook</a></Button>
              <Button asChild variant="outline"><a href={`fb-messenger://share/?link=${encodedUrl}`}><Send /> Messenger</a></Button>
              {navigator.share && <Button type="button" variant="secondary" className="col-span-2" onClick={() => navigator.share({ title, url })}><MoreHorizontal /> Autres applications</Button>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}