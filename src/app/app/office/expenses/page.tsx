"use client";

import { useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app/AuthGate";
import Sheet from "@/components/app/Sheet";
import FileLink from "@/components/app/FileLink";
import { uploadFile, useRows } from "@/lib/app/data";
import { CATEGORIES } from "@/lib/app/office";
import { supabase } from "@/lib/app/supabase";
import { localDate } from "@/lib/app/time";
import type { Expense } from "@/lib/app/types";
import { formatMoney, prettyDate } from "@/lib/pdfKit";

export default function ExpensesPage() {
  const { provider } = useApp();
  const { rows, error, reload } = useRows<Expense>("expenses", "spent_on");
  const [edit, setEdit] = useState<Partial<Expense> | null>(null);
  const money = (n: number) => formatMoney(n, provider.currency);

  if (error) return <p className="text-peach-dark">{error}</p>;
  if (!rows) return <p className="text-ink-soft">Loading…</p>;

  const months = new Map<string, Expense[]>();
  for (const e of rows) months.set(e.spent_on.slice(0, 7), [...(months.get(e.spent_on.slice(0, 7)) ?? []), e]);

  return (
    <div className="space-y-4">
      <Link href="/app/office" className="text-sm font-semibold text-ink-soft">‹ Office</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Expenses</h1>
        <button className="btn-primary px-4 py-2" onClick={() => setEdit({ spent_on: localDate(), category: CATEGORIES[0].name, business_pct: 100, home_expense: false })}>+ Add</button>
      </div>
      {rows.length === 0 && <p className="card text-ink-soft">Snap a photo of each receipt as you go. At tax time, everything is already sorted.</p>}
      {[...months.entries()].map(([m, list]) => (
        <section key={m} className="space-y-2">
          <h2 className="flex justify-between font-bold">
            <span>{new Date(`${m}-15`).toLocaleDateString([], { month: "long", year: "numeric" })}</span>
            <span className="text-ink-soft">{money(list.reduce((s, e) => s + Number(e.amount), 0))}</span>
          </h2>
          {list.map((e) => (
            <button key={e.id} className="card flex w-full items-center justify-between gap-3 py-3 text-left" onClick={() => setEdit(e)}>
              <span className="min-w-0">
                <span className="block truncate font-bold">{e.vendor || e.category}</span>
                <span className="block truncate text-sm text-ink-soft">
                  {prettyDate(e.spent_on)} · {e.category}
                  {Number(e.business_pct) < 100 && ` · ${Number(e.business_pct)}% daycare`}
                  {e.receipt_path ? " · 📎" : ""}
                </span>
              </span>
              <span className="shrink-0 font-bold">{money(Number(e.amount))}</span>
            </button>
          ))}
        </section>
      ))}
      {edit && (
        <Sheet title={edit.id ? "Edit expense" : "Add expense"} onClose={() => setEdit(null)}>
          <ExpenseForm initial={edit} uid={provider.id} currency={provider.currency} onDone={() => { setEdit(null); reload(); }} />
        </Sheet>
      )}
    </div>
  );
}

function ExpenseForm({ initial, uid, currency, onDone }: { initial: Partial<Expense>; uid: string; currency: string; onDone: () => void }) {
  const [e, setE] = useState<Partial<Expense>>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Expense>(k: K, v: Expense[K]) => setE((x) => ({ ...x, [k]: v }));

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const amount = Number(String(e.amount ?? "").replace(/[^0-9.]/g, ""));
    if (!(amount > 0)) return setErr("Enter the amount.");
    setBusy(true);
    try {
      let receipt_path = e.receipt_path ?? null;
      if (file) receipt_path = await uploadFile(uid, "receipts", file);
      const row = {
        spent_on: e.spent_on || localDate(),
        amount,
        category: e.category ?? "Other",
        vendor: (e.vendor ?? "").trim(),
        note: (e.note ?? "").trim(),
        home_expense: !!e.home_expense,
        business_pct: Math.min(100, Math.max(0, Number(e.business_pct) || 0)),
        receipt_path,
      };
      const sb = supabase();
      const { error } = e.id ? await sb.from("expenses").update(row).eq("id", e.id) : await sb.from("expenses").insert({ ...row, provider_id: uid });
      if (error) throw new Error(error.message);
      if (file && initial.receipt_path) await sb.storage.from("files").remove([initial.receipt_path]);
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!e.id || !confirm("Delete this expense?")) return;
    const sb = supabase();
    if (e.receipt_path) await sb.storage.from("files").remove([e.receipt_path]);
    const { error } = await sb.from("expenses").delete().eq("id", e.id);
    if (error) return setErr(error.message);
    onDone();
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="btn-secondary flex cursor-pointer justify-center">
        {file ? "Receipt photo added ✓" : e.receipt_path ? "Replace receipt photo" : "📷 Snap the receipt"}
        <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(x) => setFile(x.target.files?.[0] ?? null)} />
      </label>
      {e.receipt_path && !file && <div className="text-center"><FileLink path={e.receipt_path} label="See current receipt" /></div>}
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="field-label">Amount ({currency})</span><input className="field-input" inputMode="decimal" value={e.amount ?? ""} onChange={(x) => set("amount", x.target.value as unknown as number)} /></label>
        <label className="block"><span className="field-label">Date</span><input type="date" className="field-input" value={e.spent_on ?? ""} onChange={(x) => set("spent_on", x.target.value)} /></label>
      </div>
      <label className="block"><span className="field-label">Where</span><input className="field-input" placeholder="e.g. Costco" value={e.vendor ?? ""} onChange={(x) => set("vendor", x.target.value)} /></label>
      <label className="block">
        <span className="field-label">Category</span>
        <select className="field-input" value={e.category} onChange={(x) => {
          const c = CATEGORIES.find((k) => k.name === x.target.value);
          setE((v) => ({ ...v, category: x.target.value, home_expense: c?.home ?? false }));
        }}>
          {CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}
        </select>
      </label>
      {e.home_expense ? (
        <p className="rounded-xl bg-sage-soft px-3 py-2 text-sm">This is a whole-home cost. Your time-space percentage is applied to it automatically on the Taxes page.</p>
      ) : (
        <label className="block">
          <span className="field-label">How much was for the daycare? (%)</span>
          <input className="field-input" inputMode="numeric" value={e.business_pct ?? 100} onChange={(x) => set("business_pct", x.target.value as unknown as number)} />
          <span className="text-xs text-ink-soft">Use less than 100 if part of it was for your own family.</span>
        </label>
      )}
      <label className="block"><span className="field-label">Note (optional)</span><input className="field-input" value={e.note ?? ""} onChange={(x) => set("note", x.target.value)} /></label>
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save expense"}</button>
      {e.id && <button type="button" className="w-full text-sm font-semibold text-peach-dark" onClick={remove}>Delete expense</button>}
    </form>
  );
}
