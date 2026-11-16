"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import FileLink from "@/components/app/FileLink";
import { uploadFile, useRoster, useRows } from "@/lib/app/data";
import { DOC_KINDS, docStatus, type DocStatus } from "@/lib/app/office";
import { supabase } from "@/lib/app/supabase";
import type { Child, DocumentRow } from "@/lib/app/types";
import { prettyDate } from "@/lib/pdfKit";

const CHIP: Record<DocStatus, string> = {
  expired: "bg-peach text-white",
  soon: "bg-sun text-ink",
  ok: "bg-sage-soft text-ink",
  none: "bg-line text-ink-soft",
};

export default function DocumentsPage() {
  const { provider } = useApp();
  const { rows, error, reload } = useRows<DocumentRow>("documents", "expires_on", true);
  const roster = useRoster();
  const [edit, setEdit] = useState<Partial<DocumentRow> | null>(null);

  if (error || roster.error) return <p className="text-peach-dark">{error || roster.error}</p>;
  if (!rows || !roster.data) return <p className="text-ink-soft">Loading…</p>;
  const kids = roster.data.children.filter((c) => c.active);
  const who = (d: DocumentRow) => {
    const c = roster.data!.children.find((k) => k.id === d.child_id);
    return c ? `${c.first_name} ${c.last_name}`.trim() : "Business";
  };
  const label = (d: DocumentRow, s: DocStatus) =>
    s === "expired" ? `Expired ${prettyDate(d.expires_on!)}` : s === "none" ? "No expiry" : `${s === "soon" ? "Expires" : "Good until"} ${prettyDate(d.expires_on!)}`;

  return (
    <div className="space-y-4">
      <Link href="/app/office" className="text-sm font-semibold text-ink-soft">‹ Office</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Documents</h1>
        <button className="btn-primary px-4 py-2" onClick={() => setEdit({ kind: DOC_KINDS[0], child_id: kids[0]?.id ?? null })}>+ Add</button>
      </div>
      <p className="text-sm text-ink-soft">Anything that expires shows on your Today screen 30 days before it runs out.</p>
      {rows.length === 0 && <p className="card text-ink-soft">Add immunization records, health forms, your license, CPR card and insurance, with their expiry dates.</p>}
      <ul className="space-y-2">
        {rows.map((d) => {
          const s = docStatus(d);
          return (
            <li key={d.id}>
              <button className="card flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => setEdit(d)}>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{d.title}</span>
                  <span className="block truncate text-sm text-ink-soft">{who(d)} · {d.kind}{d.file_path ? " · 📎" : ""}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${CHIP[s]}`}>{label(d, s)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {edit && (
        <Sheet title={edit.id ? "Edit document" : "Add document"} onClose={() => setEdit(null)}>
          <DocForm initial={edit} kids={kids} uid={provider.id} onDone={() => { setEdit(null); reload(); }} />
        </Sheet>
      )}
    </div>
  );
}

function DocForm({ initial, kids, uid, onDone }: { initial: Partial<DocumentRow>; kids: Child[]; uid: string; onDone: () => void }) {
  const [d, setD] = useState<Partial<DocumentRow>>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DocumentRow>(k: K, v: DocumentRow[K]) => setD((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const title = (d.title ?? "").trim() || d.kind || "Document";
    setBusy(true);
    try {
      let file_path = d.file_path ?? null;
      if (file) file_path = await uploadFile(uid, "documents", file);
      const row = { title, kind: d.kind ?? "Other", child_id: d.child_id || null, expires_on: d.expires_on || null, notes: d.notes ?? "", file_path };
      const sb = supabase();
      const { error } = d.id ? await sb.from("documents").update(row).eq("id", d.id) : await sb.from("documents").insert({ ...row, provider_id: uid });
      if (error) throw new Error(error.message);
      if (file && initial.file_path) await sb.storage.from("files").remove([initial.file_path]);
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!d.id || !confirm(`Delete ${d.title}?`)) return;
    const sb = supabase();
    if (d.file_path) await sb.storage.from("files").remove([d.file_path]);
    const { error } = await sb.from("documents").delete().eq("id", d.id);
    if (error) return setErr(error.message);
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block">
        <span className="field-label">Type</span>
        <select className="field-input" value={d.kind} onChange={(e) => set("kind", e.target.value)}>{DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
      </label>
      <label className="block">
        <span className="field-label">For</span>
        <select className="field-input" value={d.child_id ?? ""} onChange={(e) => set("child_id", e.target.value || null)}>
          <option value="">My business</option>
          {kids.map((k) => <option key={k.id} value={k.id}>{k.first_name} {k.last_name}</option>)}
        </select>
      </label>
      <label className="block"><span className="field-label">Name (optional)</span><input className="field-input" placeholder={d.kind} value={d.title ?? ""} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="block"><span className="field-label">Expires on (leave blank if it doesn&apos;t)</span><input type="date" className="field-input" value={d.expires_on ?? ""} onChange={(e) => set("expires_on", e.target.value)} /></label>
      <label className="btn-secondary flex cursor-pointer justify-center">
        {file ? "File added ✓" : d.file_path ? "Replace photo or PDF" : "📷 Add a photo or PDF"}
        <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {d.file_path && !file && <div className="text-center"><FileLink path={d.file_path} label="Open current file" /></div>}
      <label className="block"><span className="field-label">Notes</span><textarea className="field-input" rows={2} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      {d.id && <button type="button" className="w-full text-sm font-semibold text-peach-dark" onClick={remove}>Delete document</button>}
    </form>
  );
}
