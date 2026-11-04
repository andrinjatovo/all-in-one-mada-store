// Visitor (guest) mode helpers: remember where the visitor was and what they
// selected before being asked to sign in, so we can resume exactly there.

const RETURN_KEY = "mada-return-after-login";
const INTENT_KEY = "mada-pending-purchase";
const INTENT_TTL_MS = 2 * 60 * 60 * 1000; // 2 h

export type PurchaseIntent = {
  productId: string;
  mode: "buy" | "cart";
  imgIdx: number;
  qty: number;
  color: string | null;
  size: string | null;
  unit: string | null;
  unitPrice: number; // prix unitaire affiché au moment du choix
  savedAt: number;
};

function isSafePath(path: string | null | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/auth");
}

export function rememberReturnPath(path: string) {
  if (typeof window === "undefined" || !isSafePath(path)) return;
  window.sessionStorage.setItem(RETURN_KEY, path);
}

export function peekReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  const p = window.sessionStorage.getItem(RETURN_KEY);
  return isSafePath(p) ? p : null;
}

export function takeReturnPath(): string | null {
  const p = peekReturnPath();
  if (typeof window !== "undefined") window.sessionStorage.removeItem(RETURN_KEY);
  return p;
}

export function savePurchaseIntent(intent: Omit<PurchaseIntent, "savedAt">) {
  if (typeof window === "undefined") return;
  // localStorage : survit à l'ouverture d'un nouvel onglet (ex. lien de confirmation e-mail)
  window.localStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, savedAt: Date.now() }));
}

/** Returns and clears the pending selection for this product (if still fresh). */
export function takePurchaseIntent(productId: string): PurchaseIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as PurchaseIntent;
    if (intent.productId !== productId) return null;
    window.localStorage.removeItem(INTENT_KEY);
    if (Date.now() - intent.savedAt > INTENT_TTL_MS) return null;
    return intent;
  } catch {
    window.localStorage.removeItem(INTENT_KEY);
    return null;
  }
}

/** Fresh intent (any product) — used to send the visitor back after an e-mail confirmation. */
export function peekPurchaseIntent(): PurchaseIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(INTENT_KEY);
    if (!raw) return null;
    const intent = JSON.parse(raw) as PurchaseIntent;
    return Date.now() - intent.savedAt > INTENT_TTL_MS ? null : intent;
  } catch {
    return null;
  }
}
