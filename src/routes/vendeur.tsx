import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/madastore/ProtectedShell";
import { TabNav } from "@/components/madastore/TabNav";
import { VendorProductsManager } from "@/components/madastore/VendorProductsManager";
import { OrdersList } from "@/components/madastore/OrdersList";
import { VendorWalletPanel } from "@/components/madastore/VendorWalletPanel";
import { VendorPickupForm } from "@/components/madastore/VendorPickupForm";
import { VendorTermsGate } from "@/components/madastore/VendorTermsGate";
import { MessagesPanel } from "@/components/madastore/MessagesPanel";
import { TicketsPanel } from "@/components/madastore/TicketsPanel";
import { SupportChat } from "@/components/madastore/SupportChat";
import { VendorApplicationWizard } from "@/components/madastore/VendorApplicationWizard";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Package, ShoppingCart, Wallet, MessageCircle, Sparkles, LifeBuoy, MapPin } from "lucide-react";

type Status = "en_attente" | "actif" | "rejete" | "suspendu";

export const Route = createFileRoute("/vendeur")({ component: VendeurPage });

const TABS = [
  { id: "produits", label: "Produits", icon: <Package className="h-5 w-5" /> },
  { id: "commandes", label: "Cmd", icon: <ShoppingCart className="h-5 w-5" /> },
  { id: "wallet", label: "Wallet", icon: <Wallet className="h-5 w-5" /> },
  { id: "pickup", label: "GPS", icon: <MapPin className="h-5 w-5" /> },
  { id: "messages", label: "Chat", icon: <MessageCircle className="h-5 w-5" /> },
  { id: "ia", label: "IA", icon: <Sparkles className="h-5 w-5" /> },
  { id: "support", label: "Aide", icon: <LifeBuoy className="h-5 w-5" /> },
];

function VendeurPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("produits");
  const [status, setStatus] = useState<Status | null>(null);
  const [shop, setShop] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("vendor_profiles")
      .select("status, shop_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setStatus(data.status as Status);
          setShop(data.shop_name);
        }
        setLoaded(true);
      });
  }, [user]);

  return (
    <ProtectedShell expectedRole="vendeur" title={shop || "Espace Vendeur"}>
      {user && loaded && status !== "actif" && <VendorApplicationWizard userId={user.id} email={user.email ?? undefined} />}
      {user && status === "actif" && (
        <VendorTermsGate userId={user.id}>
          <TabNav tabs={TABS} active={tab} onChange={setTab} />
          <div className="mt-2 pb-2">
            {tab === "produits" && <VendorProductsManager vendorId={user.id} vendorActive={status === "actif"} />}
            {tab === "commandes" && <OrdersList userId={user.id} role="vendeur" />}
            {tab === "wallet" && <VendorWalletPanel userId={user.id} />}
            {tab === "pickup" && <VendorPickupForm vendorId={user.id} />}
            {tab === "messages" && <MessagesPanel userId={user.id} />}
            {tab === "ia" && <SupportChat />}
            {tab === "support" && <TicketsPanel userId={user.id} />}
          </div>
        </VendorTermsGate>
      )}
    </ProtectedShell>
  );
}
