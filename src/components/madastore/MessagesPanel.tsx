import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Image as ImageIcon, ArrowLeft } from "lucide-react";

type Conv = { id: string; client_id: string; vendor_id: string; last_message_at: string };
type Msg = { id: string; sender_id: string; content: string | null; image_url: string | null; created_at: string };

export function MessagesPanel({ userId, initialConversationId }: { userId: string; initialConversationId?: string }) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  async function loadConvs() {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .or(`client_id.eq.${userId},vendor_id.eq.${userId}`)
      .order("last_message_at", { ascending: false });
    const cs = (data ?? []) as Conv[];
    setConvs(cs);
    if (initialConversationId) setSelected(cs.find((conversation) => conversation.id === initialConversationId) ?? null);
    // load labels (other party name)
    const otherIds = cs.map((c) => (c.client_id === userId ? c.vendor_id : c.client_id));
    if (otherIds.length) {
      const [v, cl] = await Promise.all([
        supabase.from("vendor_profiles").select("id, shop_name").in("id", otherIds),
        supabase.from("client_profiles").select("id, full_name").in("id", otherIds),
      ]);
      const map: Record<string, string> = {};
      (v.data ?? []).forEach((x: any) => (map[x.id] = x.shop_name));
      (cl.data ?? []).forEach((x: any) => (map[x.id] = map[x.id] ?? x.full_name));
      setLabels(map);
    }
  }

  useEffect(() => {
    loadConvs();
  }, [userId]);

  useEffect(() => {
    if (!selected) return;
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", selected.id)
      .order("created_at")
      .then((r) => setMsgs((r.data ?? []) as Msg[]));

    const ch = supabase
      .channel(`msg-${selected.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selected.id}` }, (payload) => {
        setMsgs((prev) => [...prev, payload.new as Msg]);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selected]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(imageUrl?: string) {
    if (!selected) return;
    const content = text.trim();
    if (!content && !imageUrl) return;
    const { error } = await supabase.from("messages").insert({
      conversation_id: selected.id,
      sender_id: userId,
      content: content || null,
      image_url: imageUrl ?? null,
    });
    if (error) return toast.error(error.message);
    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selected.id);
    setText("");
  }

  async function sendImage(file: File) {
    if (file.size > 5 * 1024 * 1024) return toast.error("Image max 5 Mo");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userId}/${Date.now()}.${ext}`;
    const up = await supabase.storage.from("chat").upload(path, file);
    if (up.error) return toast.error(up.error.message);
    const { data } = supabase.storage.from("chat").getPublicUrl(path);
    await send(data.publicUrl);
  }

  if (selected) {
    return (
      <div className="flex h-[70vh] flex-col rounded-2xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-3">
          <button onClick={() => setSelected(null)} className="rounded-lg p-1 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-bold">{labels[selected.client_id === userId ? selected.vendor_id : selected.client_id] ?? "Conversation"}</div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.sender_id === userId ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === userId ? "bg-mada-red text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                {m.image_url && <img src={m.image_url} alt="" className="mb-1 max-h-60 rounded-lg" />}
                {m.content && <div>{m.content}</div>}
                <div className="mt-0.5 text-[9px] opacity-70">{new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="flex items-center gap-2 border-t border-border p-3">
          <label className="cursor-pointer rounded-xl bg-muted p-2 hover:bg-muted/70">
            <ImageIcon className="h-4 w-4" />
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && sendImage(e.target.files[0])} />
          </label>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message..."
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2 text-sm outline-none focus:border-mada-red"
          />
          <button onClick={() => send()} className="rounded-xl bg-mada-red p-2 text-primary-foreground">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {convs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Aucune conversation. Contactez un vendeur depuis une fiche produit.
        </div>
      ) : (
        convs.map((c) => {
          const otherId = c.client_id === userId ? c.vendor_id : c.client_id;
          return (
            <button
              key={c.id}
              onClick={() => setSelected(c)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left hover:border-mada-red"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-red text-lg font-black text-primary-foreground">
                {(labels[otherId] ?? "?")[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">{labels[otherId] ?? "Utilisateur"}</div>
                <div className="text-xs text-muted-foreground">{new Date(c.last_message_at).toLocaleString("fr-FR")}</div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}
