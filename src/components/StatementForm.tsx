"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MONTHS,
  StatementData,
  buildStatementPdf,
  emptyStatement,
  formatMoney,
  statementFileName,
  statementTotal,
  validate,
  warnings,
} from "@/lib/statement";
import Field from "@/components/Field";
import { downloadBlob, loadProvider, saveProvider } from "@/lib/provider";

export default function StatementForm() {
  const [d, setD] = useState<StatementData>(emptyStatement);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [made, setMade] = useState<string | null>(null);

  useEffect(() => {
    setD((cur) => {
      const saved = loadProvider();
      const pick = Object.fromEntries(
        Object.entries(saved).filter(([k]) => k in cur && k !== "taxId"),
      ) as Partial<StatementData>;
      return { ...cur, ...pick };
    });
  }, []);

  const set = <K extends keyof StatementData>(key: K) => (value: StatementData[K]) =>
    setD((cur) => ({ ...cur, [key]: value }));

  const total = useMemo(() => statementTotal(d), [d]);
  const warn = warnings(d);
  const isUS = d.country === "US";

  async function download() {
    const problems = validate(d);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      saveProvider(d);
      const blob = await buildStatementPdf(d);
      downloadBlob(blob, statementFileName(d));
      setMade(d.parentName);
    } finally {
      setBusy(false);
    }
  }

  function nextFamily() {
    setD((cur) => ({
      ...cur,
      parentName: "",
      parentAddress: "",
      children: "",
      total: "",
      monthly: Array(12).fill(""),
      notes: "",
    }));
    setMade(null);
    setErrors([]);
    window.scrollTo({ top: document.getElementById("family")?.offsetTop ?? 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <h2 className="text-xl font-bold">1. Where is your daycare?</h2>
        <div className="grid grid-cols-2 gap-3">
          {(["US", "OTHER"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setD((cur) => ({ ...cur, country: c, currency: c === "US" ? "$" : cur.currency }))}
              className={`rounded-2xl border-2 px-3 py-3 font-semibold ${
                d.country === c ? "border-peach bg-peach-soft text-ink" : "border-line bg-paper text-ink-soft"
              }`}
            >
              {c === "US" ? "United States" : "Another country"}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year" value={d.year} onChange={set("year")} inputMode="numeric" />
          {!isUS && (
            <Field label="Currency symbol" value={d.currency} onChange={set("currency")} placeholder="£, €, A$…" />
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <h2 className="text-xl font-bold">2. Your details</h2>
        <Field label="Your name" value={d.providerName} onChange={set("providerName")} autoComplete="name" />
        <Field
          label="Daycare name (optional)"
          value={d.businessName}
          onChange={set("businessName")}
          placeholder="Little Acorns Home Daycare"
        />
        <Field label="Your address" value={d.providerAddress} onChange={set("providerAddress")} multiline />
        <Field
          label="Phone or email (optional)"
          value={d.providerContact}
          onChange={set("providerContact")}
        />
        <Field
          label={isUS ? "Tax ID (EIN or SSN)" : "Business or tax number (optional)"}
          value={d.taxId}
          onChange={set("taxId")}
          hint="Used only to make your PDF. It never leaves this device and is never saved."
        />
      </div>

      <div id="family" className="card space-y-4">
        <h2 className="text-xl font-bold">3. The family</h2>
        <Field label="Parent or guardian name" value={d.parentName} onChange={set("parentName")} />
        <Field label="Parent address (optional)" value={d.parentAddress} onChange={set("parentAddress")} multiline />
        <Field
          label="Child or children (optional)"
          value={d.children}
          onChange={set("children")}
          placeholder="Ava and Leo Smith"
        />
      </div>

      <div className="card space-y-4">
        <h2 className="text-xl font-bold">4. What they paid in {d.year || "the year"}</h2>
        <div className="grid grid-cols-2 gap-3">
          {(["total", "monthly"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set("mode")(m)}
              className={`rounded-2xl border-2 px-3 py-2.5 text-sm font-semibold ${
                d.mode === m ? "border-peach bg-peach-soft text-ink" : "border-line bg-paper text-ink-soft"
              }`}
            >
              {m === "total" ? "One yearly total" : "Month by month"}
            </button>
          ))}
        </div>
        {d.mode === "total" ? (
          <Field label="Total paid" value={d.total} onChange={set("total")} inputMode="decimal" placeholder="9,600.00" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MONTHS.map((m, i) => (
              <Field
                key={m}
                label={m}
                value={d.monthly[i]}
                inputMode="decimal"
                onChange={(v) =>
                  setD((cur) => {
                    const monthly = [...cur.monthly];
                    monthly[i] = v;
                    return { ...cur, monthly };
                  })
                }
              />
            ))}
          </div>
        )}
        <Field label="Notes (optional)" value={d.notes} onChange={set("notes")} placeholder="Includes registration fee" />
        <p className="rounded-2xl bg-sage-soft px-4 py-3 font-bold text-ink">
          Total on statement: {formatMoney(total, d.currency)}
        </p>
      </div>

      {(errors.length > 0 || warn.length > 0) && (
        <div className="space-y-2" aria-live="polite">
          {errors.map((e) => (
            <p key={e} className="rounded-xl bg-peach-soft px-4 py-2 font-semibold text-peach-dark">
              {e}
            </p>
          ))}
          {warn.map((w) => (
            <p key={w} className="rounded-xl bg-paper px-4 py-2 text-sm text-ink-soft">
              Tip: {w}
            </p>
          ))}
        </div>
      )}

      <div className="sticky bottom-3 z-10">
        <button type="button" onClick={download} disabled={busy} className="btn-primary w-full text-lg">
          {busy ? "Making your PDF…" : "Download statement PDF"}
        </button>
      </div>

      {made && (
        <div className="card space-y-3 border-sage">
          <p className="font-bold">Statement for {made} downloaded.</p>
          <p className="text-ink-soft">Your details are kept, so the next family takes about a minute.</p>
          <button type="button" onClick={nextFamily} className="btn-secondary">
            Make one for the next family
          </button>
          <p className="text-sm text-ink-soft">
            Doing this for every family every year? Naptime Office builds these automatically from the payments you
            record, opening December 2026.
          </p>
        </div>
      )}
    </div>
  );
}
