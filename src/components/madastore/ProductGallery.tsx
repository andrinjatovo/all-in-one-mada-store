import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProductGallery({ images, title, active, onChange }: { images: string[]; title: string; active: number; onChange: (index: number) => void }) {
  const [zoomed, setZoomed] = useState(false);
  const safeImages = images.filter(Boolean);
  const current = safeImages[active] ?? safeImages[0];

  useEffect(() => {
    if (!zoomed) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setZoomed(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [zoomed]);

  function move(delta: number) {
    if (safeImages.length < 2) return;
    onChange((active + delta + safeImages.length) % safeImages.length);
  }

  return (
    <>
      <div className="relative aspect-square overflow-hidden bg-muted sm:rounded-md">
        {current ? (
          <button type="button" aria-label="Agrandir l’image" onClick={() => setZoomed(true)} className="h-full w-full cursor-zoom-in">
            <img src={current} alt={`${title} — image ${active + 1}`} className="h-full w-full object-contain" />
          </button>
        ) : <div className="grid h-full place-items-center text-6xl">📦</div>}
        {current && <Button type="button" variant="secondary" size="icon" aria-label="Agrandir l’image" onClick={() => setZoomed(true)} className="absolute right-3 top-3"><Maximize2 /></Button>}
        {safeImages.length > 1 && (
          <>
            <Button type="button" variant="secondary" size="icon" aria-label="Image précédente" onClick={() => move(-1)} className="absolute left-3 top-1/2 -translate-y-1/2"><ChevronLeft /></Button>
            <Button type="button" variant="secondary" size="icon" aria-label="Image suivante" onClick={() => move(1)} className="absolute right-3 top-1/2 -translate-y-1/2"><ChevronRight /></Button>
            <span className="absolute bottom-3 right-3 rounded-full bg-popover/90 px-2 py-1 text-xs font-bold">{active + 1}/{safeImages.length}</span>
          </>
        )}
      </div>
      {safeImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 sm:px-0">
          {safeImages.map((image, index) => (
            <button type="button" key={`${image}-${index}`} onClick={() => onChange(index)} aria-label={`Afficher l’image ${index + 1}`} className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${index === active ? "border-mada-red" : "border-border"}`}>
              <img src={image} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {zoomed && current && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 p-3" role="dialog" aria-modal="true" aria-label="Image agrandie">
          <img src={current} alt={`${title} agrandi`} className="max-h-[88vh] max-w-full object-contain" />
          <Button type="button" variant="secondary" size="icon" aria-label="Fermer l’image agrandie" onClick={() => setZoomed(false)} className="absolute right-4 top-4"><X /></Button>
          {safeImages.length > 1 && <>
            <Button type="button" variant="secondary" size="icon" aria-label="Image précédente" onClick={() => move(-1)} className="absolute left-3 top-1/2"><ChevronLeft /></Button>
            <Button type="button" variant="secondary" size="icon" aria-label="Image suivante" onClick={() => move(1)} className="absolute right-3 top-1/2"><ChevronRight /></Button>
          </>}
        </div>
      )}
    </>
  );
}