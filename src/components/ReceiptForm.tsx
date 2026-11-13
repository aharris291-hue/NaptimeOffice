"use client";

import Field from "@/components/Field";
import ProviderFields from "@/components/ProviderFields";
import { Errors, useToolState } from "@/components/useToolState";
import { METHODS, buildReceiptPdf, emptyReceipt, receiptFileName, validateReceipt } from "@/lib/receipt";

export default function ReceiptForm() {
  const { d, setD, set, busy, errors, done, setDone, download } = useToolState(emptyReceipt);
  return (
    <div className="space-y-5">
      <ProviderFields value={d} set={set} />
      <div id="payment" className="card space-y-4">
        <h2 className="text-xl font-bold">The payment</h2>
        <Field label="Who paid" value={d.parentName} onChange={set("parentName")} />
        <Field label="Child or children (optional)" value={d.children} onChange={set("children")} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" value={d.amount} onChange={set("amount")} inputMode="decimal" placeholder="200.00" />
          <Field label="Payment date" type="date" value={d.date} onChange={set("date")} />
        </div>
        <div>
          <p className="field-label">Paid by</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("method")(m)}
                className={`rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
                  d.method === m ? "border-peach bg-peach-soft text-ink" : "border-line bg-paper text-ink-soft"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <Field
          label="Check number or transaction ID (optional)"
          value={d.reference}
          onChange={set("reference")}
        />
        <Field
          label="Care period (optional)"
          value={d.forPeriod}
          onChange={set("forPeriod")}
          placeholder="week of March 2–6"
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Receipt number (optional)" value={d.receiptNumber} onChange={set("receiptNumber")} />
        </div>
        <Field label="Notes (optional)" value={d.notes} onChange={set("notes")} />
      </div>
      <Errors errors={errors} />
      <div className="sticky bottom-3 z-10">
        <button
          type="button"
          disabled={busy}
          onClick={() => download(validateReceipt, buildReceiptPdf, receiptFileName)}
          className="btn-primary w-full text-lg"
        >
          {busy ? "Making your PDF…" : "Download receipt PDF"}
        </button>
      </div>
      {done && (
        <div className="card space-y-3">
          <p className="font-bold">Receipt downloaded.</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setD((c) => ({ ...c, parentName: "", children: "", amount: "", reference: "", notes: "", receiptNumber: "" }));
              setDone(false);
            }}
          >
            Make another receipt
          </button>
        </div>
      )}
    </div>
  );
}
