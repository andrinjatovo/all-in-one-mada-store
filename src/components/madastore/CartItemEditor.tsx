import { useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { formatMGA } from "@/components/madastore/Money";
import type { CartItem } from "@/lib/cart";

export type ProductInfo = {
  id: string;
  category_id: string | null;
  stock: number;
  price_mga: number;
  discount_percent: number;
  promo_until: string | null;
  variants: any;
  images: string[] | null;
  availability?: string;
  preorder?: any;
  advance_percent?: number;
};

type Variant = {
  image_index: number;
  price_mga: number;
  colors?: string[];
  sizes?: string[];
  units?: string[];
  custom?: string;
};

export function priceOf(info: ProductInfo | undefined, fallback: number, variantPrice?: number) {
  const base = variantPrice ?? info?.price_mga ?? fallback;
  const promo =
    info && info.discount_percent > 0 && (!info.promo_until || new Date(info.promo_until) > new Date())
      ? info.discount_percent
      : 0;
  return promo ? Math.floor((base * (100 - promo)) / 100) : base;
}

export function CartItemEditor({
  item,
  info,
  onClose,
  onSave,
}: {
  item: CartItem;
  info?: ProductInfo;
  onClose: () => void;
  onSave: (patch: Partial<CartItem>) => void;
}) {
  const variants: Variant[] = Array.isArray(info?.variants) ? (info!.variants as Variant[]) : [];
  const colors = Array.from(new Set(variants.flatMap((v) => v.colors ?? [])));
  const sizes = Array.from(new Set(variants.flatMap((v) => v.sizes ?? [])));
  const units = Array.from(new Set(variants.flatMap((v) => v.units ?? [])));
  const maxStock = Math.max(1, info?.stock ?? 99);

  const [qty, setQty] = useState(item.qty);
  const [color, setColor] = useState<string | null>(item.color ?? null);
  const [size, setSize] = useState<string | null>(item.size ?? null);
  const [unit, setUnit] = useState<string | null>(item.unit ?? null);

  const variant =
    variants.find(
      (v) => (color && v.colors?.includes(color)) || (size && v.sizes?.includes(size)),
    ) ?? variants[0];
  const unitPrice = priceOf(info, item.unit_price_mga, variant?.price_mga);
  const effUnit = qty >= 10 ? Math.floor(unitPrice * 0.98) : unitPrice;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-3xl bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
            {item.image && <img src={item.image} alt="" className="h-full w-full object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 text-sm font-bold">{item.title}</div>
            <div className="text-lg font-black text-mada-red">{formatMGA(effUnit)}</div>
            <div className="text-[11px] text-muted-foreground">Stock disponible : {info?.stock ?? "—"}</div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {colors.length > 0 && (
          <Group label="Couleur">
            {colors.map((c) => (
              <Chip key={c} active={color === c} onClick={() => setColor(color === c ? null : c)}>
                {c}
              </Chip>
            ))}
          </Group>
        )}
        {sizes.length > 0 && (
          <Group label="Taille / pointure">
            {sizes.map((s) => (
              <Chip key={s} active={size === s} onClick={() => setSize(size === s ? null : s)}>
                {s}
              </Chip>
            ))}
          </Group>
        )}
        {units.length > 0 && (
          <Group label="Unité / mesure">
            {units.map((u) => (
              <Chip key={u} active={unit === u} onClick={() => setUnit(unit === u ? null : u)}>
                {u}
              </Chip>
            ))}
          </Group>
        )}

        <Group label="Quantité">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border"
              aria-label="Diminuer"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-black">{qty}</span>
            <button
              onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border"
              aria-label="Augmenter"
            >
              <Plus className="h-4 w-4" />
            </button>
            <span className="ml-2 text-xs text-muted-foreground">10+ = -2%</span>
          </div>
        </Group>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-bold">Sous-total</span>
          <span className="text-xl font-black text-mada-red">{formatMGA(effUnit * qty)}</span>
        </div>

        <button
          onClick={() => onSave({ qty, color, size, unit, unit_price_mga: unitPrice })}
          className="w-full rounded-xl bg-mada-green py-3 text-sm font-black text-secondary-foreground"
        >
          Enregistrer les modifications
        </button>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
        active ? "border-mada-red bg-mada-red text-primary-foreground" : "border-border bg-card"
      }`}
    >
      {children}
    </button>
  );
}
