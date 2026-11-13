"use client";

import Field from "@/components/Field";
import { Errors, useToolState } from "@/components/useToolState";
import { SheetData, buildSheetPdf, sheetFileName } from "@/lib/attendance";

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 1 ? 0 : (8 - day) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const empty = (): SheetData => ({ providerName: "", businessName: "", weekOf: nextMonday(), children: "", weekends: false });

export default function SheetForm() {
  const { d, set, busy, errors, done, download } = useToolState(empty);
  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Field label="Daycare name" value={d.businessName} onChange={set("businessName")} placeholder="Little Acorns Home Daycare" />
        <Field label="Week starting (Monday)" type="date" value={d.weekOf} onChange={set("weekOf")} />
        <Field
          label="Children's names (optional)"
          value={d.children}
          onChange={set("children")}
          multiline
          placeholder="One per line, or separated by commas. Leave blank for empty rows."
        />
        <label className="flex items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--peach)]"
            checked={d.weekends}
            onChange={(e) => set("weekends")(e.target.checked)}
          />
          Include Saturday and Sunday
        </label>
      </div>
      <Errors errors={errors} />
      <div className="sticky bottom-3 z-10">
        <button
          type="button"
          disabled={busy}
          onClick={() => download(() => [], buildSheetPdf, sheetFileName)}
          className="btn-primary w-full text-lg"
        >
          {busy ? "Making your PDF…" : "Download attendance sheets"}
        </button>
      </div>
      {done && (
        <div className="card">
          <p className="font-bold">Sheets downloaded: one page per day, ready to print.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Tired of paper? Naptime Office lets parents sign in and out on your phone and keeps every record by date,
            opening December 2026.
          </p>
        </div>
      )}
    </div>
  );
}
