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

// Provider details are remembered on this device only. The tax ID is never remembered.
const STORAGE_KEY = "naptime-office:statement-provider";
const PROVIDER_FIELDS = ["country", "currency", "year", "providerName", "businessName", "providerAddress", "providerContact"] as const;

function loadSaved(): Partial<StatementData> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<StatementData>) : {};
  } catch {
    return {};
  }
}

function saveProvider(d: StatementData) {
  try {
    const keep = Object.fromEntries(PROVIDER_FIELDS.map((k) => [k, d[k]]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keep));
  } catch {
    // Storage blocked (private browsing): nothing to do.
  }
}

function Field(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  inputMode?: "text" | "decimal" | "numeric";
  autoComplete?: string;
}) {
  const id = props.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {props.label}
      </label>
      {props.multiline ? (
        <textarea
          id={id}
          rows={2}
          className="field-input"
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          id={id}
          className="field-input"
          value={props.value}
          placeholder={props.placeholder}
          inputMode={props.inputMode}
          autoComplete={props.autoComplete ?? "off"}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.hint && <p className="mt-1 text-xs text-ink-soft">{props.hint}</p>}
    </div>
  );
}

export default function StatementForm() {
  const [d, setD] = useState<StatementData>(emptyStatement);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [made, setMade] = useState<string | null>(null);

  useEffect(() => {
    setD((cur) => ({ ...cur, ...loadSaved() }));
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
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = statementFileName(d);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
