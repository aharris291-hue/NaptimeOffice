"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/components/app/AuthGate";
import { fetchAll, useRoster } from "@/lib/app/data";
import { careHours, csv, downloadText, expenseSummary, timeSpace } from "@/lib/app/office";
import { shareOrDownload } from "@/lib/app/billing";
import { supabase } from "@/lib/app/supabase";
import type { Attendance, Expense, Payment, TimeSpace } from "@/lib/app/types";
import { formatMoney } from "@/lib/pdfKit";
import { buildStatementPdf, emptyStatement, statementFileName, type StatementData } from "@/lib/statement";

type YearData = { payments: Payment[]; expenses: Expense[]; attendance: Attendance[]; ts: TimeSpace | null };

const defaultYear = () => (new Date().getMonth() < 3 ? new Date().getFullYear() - 1 : new Date().getFullYear());

export default function TaxesPage() {
  const { provider } = useApp();
  const roster = useRoster();
  const [year, setYear] = useState(defaultYear());
  const [data, setData] = useState<YearData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ts, setTs] = useState<TimeSpace>({ year, extra_hours: 0, total_sqft: 0, daycare_sqft: 0 });
  const [saved, setSaved] = useState<string | null>(null);
  const [taxId, setTaxId] = useState("");
  const money = (n: number) => formatMoney(n, provider.currency);
  const isUS = provider.country === "US";

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    const sb = supabase();
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    try {
      const [payments, expenses, attendance, tsRes] = await Promise.all([
        fetchAll<Payment>((a, b) => sb.from("payments").select("*").gte("paid_on", start).lte("paid_on", end).order("paid_on").range(a, b)),
        fetchAll<Expense>((a, b) => sb.from("expenses").select("*").gte("spent_on", start).lte("spent_on", end).order("spent_on").range(a, b)),
        fetchAll<Attendance>((a, b) => sb.from("attendance").select("care_date, check_in, check_out").gte("care_date", start).lte("care_date", end).order("care_date").range(a, b)),
        sb.from("time_space").select("*").eq("year", year).maybeSingle(),
      ]);
      const row = (tsRes.data as TimeSpace | null) ?? null;
      setTs(row ?? { year, extra_hours: 0, total_sqft: 0, daycare_sqft: 0 });
      setData({ payments, expenses, attendance, ts: row });
    } catch (e) {
      setError((e as Error).message);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTs(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase().from("time_space").upsert({
      provider_id: provider.id,
      year,
      extra_hours: Number(ts.extra_hours) || 0,
      total_sqft: Number(ts.total_sqft) || 0,
      daycare_sqft: Number(ts.daycare_sqft) || 0,
    });
    setSaved(error ? error.message : "Saved ✓");
    if (!error) setData((d) => (d ? { ...d, ts } : d));
  }

  if (error || roster.error) return <p className="text-peach-dark">{error || roster.error}</p>;

  const years = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);
  const hours = data ? careHours(data.attendance, Number(ts.extra_hours)) : { days: 0, hours: 0 };
  const t = timeSpace(year, hours.hours, ts);
  const summary = data ? expenseSummary(data.expenses, t.pct) : { rows: [], total: 0 };
  const income = data ? data.payments.reduce((s, p) => s + Number(p.amount), 0) : 0;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  // One statement per family and payer.
  const payers = new Map<string, { familyId: string; name: string; payments: Payment[] }>();
  for (const p of data?.payments ?? []) {
    const fam = roster.data?.families.find((f) => f.id === p.family_id);
    const name = p.paid_by || fam?.name || "Family";
    const key = `${p.family_id}|${name.toLowerCase()}`;
    const v = payers.get(key) ?? { familyId: p.family_id, name, payments: [] };
    v.payments.push(p);
    payers.set(key, v);
  }

  async function statement(p: { familyId: string; name: string; payments: Payment[] }) {
    const kids = roster.data?.children.filter((c) => c.family_id === p.familyId).map((c) => `${c.first_name} ${c.last_name}`.trim()) ?? [];
    const monthly = Array(12).fill(0) as number[];
    for (const x of p.payments) monthly[Number(x.paid_on.slice(5, 7)) - 1] += Number(x.amount);
    const d: StatementData = {
      ...emptyStatement(),
      country: isUS ? "US" : "OTHER",
      currency: provider.currency,
      year: String(year),
      providerName: provider.provider_name,
      businessName: provider.business_name,
      providerAddress: provider.address,
      providerContact: [provider.phone, provider.email].filter(Boolean).join(" · "),
      taxId: taxId.trim(),
      parentName: p.name,
      children: kids.join(", "),
      mode: "monthly",
      monthly: monthly.map((m) => (m ? m.toFixed(2) : "")),
    };
    const blob = await buildStatementPdf(d);
    await shareOrDownload(blob, statementFileName(d), `${year} child care statement from ${provider.business_name || provider.provider_name}`);
  }

  function exportCsv() {
    if (!data) return;
    const rows: (string | number)[][] = [["Date", "Where", "Category", "Amount", "Daycare %", "Whole-home cost", "Deductible (estimate)", "Note"]];
    for (const e of data.expenses) {
      const base = (Number(e.amount) * Number(e.business_pct)) / 100;
      rows.push([e.spent_on, e.vendor, e.category, Number(e.amount).toFixed(2), Number(e.business_pct), e.home_expense ? "Yes" : "No", (e.home_expense ? base * t.pct : base).toFixed(2), e.note]);
    }
    rows.push([], ["Time-space percentage", pct(t.pct)], ["Care hours", hours.hours], ["Income received", income.toFixed(2)]);
    downloadText(csv(rows), `naptime-office-${year}-taxes.csv`);
  }

  return (
    <div className="space-y-5">
      <Link href="/app/office" className="text-sm font-semibold text-ink-soft">‹ Office</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">Taxes</h1>
        <select className="field-input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Tax year">
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      {!data ? (
        <p className="text-ink-soft">Adding it all up…</p>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-2 text-center">
            <div className="card px-2 py-3"><p className="text-xs text-ink-soft">Income</p><p className="font-extrabold">{money(income)}</p></div>
            <div className="card px-2 py-3"><p className="text-xs text-ink-soft">Deductions</p><p className="font-extrabold">{money(summary.total)}</p></div>
            <div className="card px-2 py-3"><p className="text-xs text-ink-soft">Profit</p><p className="font-extrabold text-sage">{money(income - summary.total)}</p></div>
          </section>
          <p className="text-xs text-ink-soft">Estimates to help you and your tax preparer. Not tax advice.</p>

          <section className="card space-y-3">
            <h2 className="font-bold">Year-end statements for parents</h2>
            <p className="text-sm text-ink-soft">One statement per paying parent, from the payments you recorded in {year}{isUS ? ", ready for their child care tax credit" : ""}.</p>
            <label className="block">
              <span className="field-label">{isUS ? "Your EIN or SSN (printed on statements, never saved)" : "Your provider or tax ID (optional, never saved)"}</span>
              <input className="field-input" autoComplete="off" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            </label>
            {payers.size === 0 && <p className="text-sm text-ink-soft">No payments recorded for {year} yet.</p>}
            {[...payers.values()].map((p) => (
              <div key={`${p.familyId}${p.name}`} className="flex items-center justify-between rounded-2xl border border-line p-3">
                <span>
                  <span className="block font-bold">{p.name}</span>
                  <span className="text-sm text-ink-soft">{money(p.payments.reduce((s, x) => s + Number(x.amount), 0))} in {p.payments.length} payment{p.payments.length === 1 ? "" : "s"}</span>
                </span>
                <button className="btn-secondary px-3 py-2 text-sm" onClick={() => statement(p)}>Send PDF</button>
              </div>
            ))}
          </section>

          <form onSubmit={saveTs} className="card space-y-3">
            <h2 className="font-bold">Time-space percentage</h2>
            <p className="text-sm text-ink-soft">How much of your home&apos;s costs count as business. It multiplies the share of the year your home was used for care by the share of your home used for care.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="field-label">Whole home (sq ft)</span><input className="field-input" inputMode="numeric" value={ts.total_sqft || ""} onChange={(e) => setTs({ ...ts, total_sqft: e.target.value as unknown as number })} /></label>
              <label className="block"><span className="field-label">Used for daycare (sq ft)</span><input className="field-input" inputMode="numeric" value={ts.daycare_sqft || ""} onChange={(e) => setTs({ ...ts, daycare_sqft: e.target.value as unknown as number })} /></label>
            </div>
            <label className="block">
              <span className="field-label">Extra hours with no children (prep, cleaning, paperwork)</span>
              <input className="field-input" inputMode="decimal" value={ts.extra_hours || ""} onChange={(e) => setTs({ ...ts, extra_hours: e.target.value as unknown as number })} />
            </label>
            <div className="rounded-2xl bg-cream p-3 text-sm">
              <p>Care hours from your sign-in records: <b>{hours.hours.toLocaleString()}</b> over {hours.days} days → time {pct(t.timePct)}</p>
              <p>Space used: {pct(t.spacePct)}</p>
              <p className="mt-1 text-base font-extrabold">Time-space percentage: {pct(t.pct)}</p>
            </div>
            <button className="btn-secondary w-full">Save</button>
            {saved && <p className="text-center text-sm font-semibold">{saved}</p>}
          </form>

          <section className="card space-y-2">
            <h2 className="font-bold">Deductions by category</h2>
            {summary.rows.length === 0 && <p className="text-sm text-ink-soft">No expenses for {year}. <Link className="font-semibold text-peach-dark" href="/app/office/expenses">Add expenses</Link></p>}
            {summary.rows.map((r) => (
              <div key={r.category} className="flex justify-between gap-2 text-sm">
                <span>{r.category}{r.home && <span className="text-ink-soft"> ({money(r.spent)} × {pct(t.pct)})</span>}</span>
                <span className="font-bold">{money(r.deductible)}</span>
              </div>
            ))}
            <button className="btn-secondary mt-2 w-full" onClick={exportCsv}>Download for your tax preparer</button>
          </section>
        </>
      )}
    </div>
  );
}
