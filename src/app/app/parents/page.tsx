"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import Thread from "@/components/app/Thread";
import { photoUrls, shrinkImage, useRoster, useRows, type Roster } from "@/lib/app/data";
import { supabase } from "@/lib/app/supabase";
import { clock, localDate } from "@/lib/app/time";
import type { Announcement, Family, Message, Photo, Provider } from "@/lib/app/types";
import { prettyDate } from "@/lib/pdfKit";

type Tab = "messages" | "photos" | "announcements";

export default function ParentsPage() {
  const [tab, setTab] = useState<Tab>("messages");
  const roster = useRoster();
  const { provider } = useApp();
  if (roster.error) return <p className="text-peach-dark">{roster.error}</p>;
  if (!roster.data) return <p className="text-ink-soft">Loading…</p>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Parents</h1>
      <div className="grid grid-cols-3 rounded-2xl bg-line p-1 text-sm font-bold">
        {(["messages", "photos", "announcements"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-xl py-2 capitalize ${tab === t ? "bg-paper shadow" : "text-ink-soft"}`}>{t}</button>
        ))}
      </div>
      {tab === "messages" && <Messages roster={roster.data} provider={provider} />}
      {tab === "photos" && <Photos roster={roster.data} provider={provider} />}
      {tab === "announcements" && <Announcements provider={provider} />}
    </div>
  );
}

function Messages({ roster, provider }: { roster: Roster; provider: Provider }) {
  const { rows, reload } = useRows<Message>("messages", "created_at", true);
  const [open, setOpen] = useState<Family | null>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const joined = roster.contacts.filter((c) => c.user_id).length;
  const invited = roster.contacts.filter((c) => c.invited_at && !c.user_id).length;

  useEffect(() => {
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, [reload]);

  async function openThread(f: Family) {
    setOpen(f);
    await supabase().rpc("mark_messages_read", { fam: f.id });
    reload();
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !open) return;
    const { error } = await supabase().from("messages").insert({
      provider_id: provider.id, family_id: open.id, from_parent: false, sender_name: provider.provider_name || provider.business_name, body: text.trim(),
    });
    if (error) return setErr(error.message);
    setText("");
    reload();
  }

  const families = roster.families.filter((f) => f.active);
  const last = (f: Family) => [...(rows ?? [])].reverse().find((m) => m.family_id === f.id);
  families.sort((a, b) => (last(b)?.created_at ?? "").localeCompare(last(a)?.created_at ?? ""));

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-soft">
        {joined} parent{joined === 1 ? "" : "s"} using the parent app{invited ? `, ${invited} invited` : ""}. Invite parents from their card in Families.
      </p>
      {families.map((f) => {
        const m = last(f);
        const unread = (rows ?? []).filter((x) => x.family_id === f.id && x.from_parent && !x.read_at).length;
        return (
          <button key={f.id} className="card flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => openThread(f)}>
            <span className="min-w-0">
              <span className="block font-bold">{f.name}</span>
              <span className="block truncate text-sm text-ink-soft">{m ? `${m.from_parent ? "" : "You: "}${m.body}` : "No messages yet"}</span>
            </span>
            {unread > 0 ? <span className="rounded-full bg-peach px-2 py-0.5 text-xs font-bold text-white">{unread}</span> : m && <span className="shrink-0 text-xs text-ink-soft">{clock(m.created_at)}</span>}
          </button>
        );
      })}
      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <Thread messages={(rows ?? []).filter((m) => m.family_id === open.id)} mine={(m) => !m.from_parent} text={text} setText={setText} onSend={send} err={err} />
        </Sheet>
      )}
    </div>
  );
}

function Photos({ roster, provider }: { roster: Roster; provider: Provider }) {
  const { rows, reload } = useRows<Photo>("photos", "created_at");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const kids = roster.children.filter((c) => c.active);

  const refreshUrls = useCallback(async () => {
    if (rows) setUrls(await photoUrls(rows.slice(0, 90).map((r) => r.path)));
  }, [rows]);
  useEffect(() => {
    refreshUrls();
  }, [refreshUrls]);

  async function remove(p: Photo) {
    if (!confirm("Delete this photo for everyone?")) return;
    const sb = supabase();
    await sb.storage.from("photos").remove([p.path]);
    await sb.from("photos").delete().eq("id", p.id);
    reload();
  }

  return (
    <div className="space-y-3">
      <button className="btn-primary w-full" onClick={() => setAdding(true)}>📷 Share photos</button>
      <p className="text-sm text-ink-soft">Parents only see photos you tag with their child.</p>
      <div className="grid grid-cols-3 gap-1">
        {(rows ?? []).slice(0, 90).map((p) => urls[p.path] && (
          <div key={p.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urls[p.path]} alt={p.caption} className="aspect-square w-full rounded-lg object-cover" />
            <span className="absolute bottom-1 left-1 rounded bg-ink/60 px-1 text-[10px] text-white">
              {p.child_ids.map((id) => kids.find((k) => k.id === id)?.first_name).filter(Boolean).join(", ") || "Untagged"}
            </span>
            <button className="absolute right-1 top-1 rounded-full bg-ink/60 px-2 text-white" aria-label="Delete photo" onClick={() => remove(p)}>×</button>
          </div>
        ))}
      </div>
      {adding && (
        <Sheet title="Share photos" onClose={() => setAdding(false)}>
          <PhotoUpload kids={kids} uid={provider.id} onDone={() => { setAdding(false); reload(); }} />
        </Sheet>
      )}
    </div>
  );
}

function PhotoUpload({ kids, uid, onDone }: { kids: Roster["children"]; uid: string; onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [tagged, setTagged] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function upload() {
    if (!files.length) return setErr("Choose at least one photo.");
    if (!tagged.length) return setErr("Tag at least one child so their parents can see it.");
    const sb = supabase();
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const blob = await shrinkImage(files[i], 1600);
        const path = `${uid}/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error(up.error.message);
        const { error } = await sb.from("photos").insert({ provider_id: uid, path, caption: caption.trim(), child_ids: tagged, taken_on: localDate() });
        if (error) throw new Error(error.message);
      } catch (e) {
        setProgress(null);
        return setErr(`Photo ${i + 1} didn't upload: ${(e as Error).message}`);
      }
    }
    onDone();
  }

  return (
    <div className="space-y-3">
      <label className="btn-secondary flex cursor-pointer justify-center">
        {files.length ? `${files.length} photo${files.length === 1 ? "" : "s"} chosen ✓` : "Choose photos"}
        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
      </label>
      <p className="field-label">Who&apos;s in them?</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-full border-2 border-line px-3 py-1 text-sm font-semibold" onClick={() => setTagged(tagged.length === kids.length ? [] : kids.map((k) => k.id))}>
          {tagged.length === kids.length ? "Clear" : "Everyone"}
        </button>
        {kids.map((k) => {
          const on = tagged.includes(k.id);
          return (
            <button key={k.id} type="button" onClick={() => setTagged(on ? tagged.filter((x) => x !== k.id) : [...tagged, k.id])}
              className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${on ? "border-peach bg-peach-soft" : "border-line text-ink-soft"}`}>{k.first_name}</button>
          );
        })}
      </div>
      <label className="block"><span className="field-label">Caption (optional)</span><input className="field-input" placeholder="e.g. Painting with leaves!" value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full" disabled={!!progress} onClick={upload}>{progress ?? "Share with parents"}</button>
    </div>
  );
}

function Announcements({ provider }: { provider: Provider }) {
  const { rows, reload } = useRows<Announcement>("announcements", "publish_at");
  const [adding, setAdding] = useState(false);
  const now = new Date().toISOString();
  return (
    <div className="space-y-3">
      <button className="btn-primary w-full" onClick={() => setAdding(true)}>📣 New announcement</button>
      {(rows ?? []).length === 0 && <p className="text-sm text-ink-soft">Closures, reminders, field trips. You can schedule them ahead of time.</p>}
      {(rows ?? []).map((a) => (
        <div key={a.id} className="card py-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">{a.title}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${a.publish_at > now ? "bg-sun" : "bg-sage-soft"}`}>
              {a.publish_at > now ? `Scheduled ${prettyDate(localDate(new Date(a.publish_at)))} ${clock(a.publish_at)}` : "Sent"}
            </span>
          </div>
          <p className="whitespace-pre-line text-sm">{a.body}</p>
          <button className="mt-1 text-sm font-semibold text-ink-soft" onClick={async () => {
            if (!confirm("Delete this announcement?")) return;
            await supabase().from("announcements").delete().eq("id", a.id);
            reload();
          }}>Delete</button>
        </div>
      ))}
      {adding && (
        <Sheet title="New announcement" onClose={() => setAdding(false)}>
          <AnnouncementForm uid={provider.id} onDone={() => { setAdding(false); reload(); }} />
        </Sheet>
      )}
    </div>
  );
}

function AnnouncementForm({ uid, onDone }: { uid: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("");
  const [err, setErr] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErr("Add a title.");
    const { error } = await supabase().from("announcements").insert({
      provider_id: uid, title: title.trim(), body: body.trim(), publish_at: when ? new Date(when).toISOString() : new Date().toISOString(),
    });
    if (error) return setErr(error.message);
    onDone();
  }
  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block"><span className="field-label">Title</span><input className="field-input" placeholder="e.g. Closed Friday for Thanksgiving" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block"><span className="field-label">Message</span><textarea className="field-input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <label className="block"><span className="field-label">Send later (optional)</span><input type="datetime-local" className="field-input" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full">{when ? "Schedule" : "Send now"}</button>
    </form>
  );
}
