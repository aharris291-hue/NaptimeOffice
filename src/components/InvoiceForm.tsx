"use client";

import Field from "@/components/Field";
import ProviderFields from "@/components/ProviderFields";
import { Errors, useToolState } from "@/components/useToolState";
import { formatMoney, parseAmount } from "@/lib/pdfKit";
import {
  InvoiceLine,
  buildInvoicePdf,
  emptyInvoice,
  invoiceBalance,
  invoiceFileName,
  invoiceSubtotal,
  lineTotal,
  validateInvoice,
} from "@/lib/invoice";

export default function InvoiceForm() {
  const { d, setD, set, busy, errors, done, setDone, download } = useToolState(emptyInvoice);
  const setItem = (i: number, patch: Partial<InvoiceLine>) =>
    setD((c) => ({ ...c, items: c.items.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  return (
    <div className="space-y-5">
      <ProviderFields value={d} set={set} />
      <div className="card space-y-4">
        <h2 className="text-xl font-bold">Bill to</h2>
        <Field label="Parent or guardian name" value={d.parentName} onChange={set("parentName")} />
        <Field label="Parent phone or email (optional)" value={d.parentContact} onChange={set("parentContact")} />
        <Field label="Child or children (optional)" value={d.children} onChange={set("children")} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice date" type="date" value={d.date} onChange={set("date")} />
          <Field label="Due date (optional)" type="date" value={d.dueDate} onChange={set("dueDate")} />
        </div>
        <Field label="Invoice number (optional)" value={d.invoiceNumber} onChange={set("invoiceNumber")} />
      </div>

      <div className="card space-y-4">
        <h2 className="text-xl font-bold">Charges</h2>
        {d.items.map((l, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-line p-3">
            <Field
              id={`item-${i}-description`}
              label="Description"
              value={l.description}
              onChange={(v) => setItem(i, { description: v })}
              placeholder="Child care, week of March 2"
            />
            <div className="grid grid-cols-3 items-end gap-3">
              <Field id={`item-${i}-qty`} label="Qty" value={l.qty} inputMode="decimal" onChange={(v) => setItem(i, { qty: v })} />
              <Field
                id={`item-${i}-rate`}
                label="Rate"
                value={l.rate}
                inputMode="decimal"
                onChange={(v) => setItem(i, { rate: v })}
                placeholder="200"
              />
              <p className="pb-3 text-right font-bold">{formatMoney(lineTotal(l), d.currency)}</p>
            </div>
            {d.items.length > 1 && (
              <button
                type="button"
                className="text-sm font-semibold text-peach-dark"
                onClick={() => setD((c) => ({ ...c, items: c.items.filter((_, j) => j !== i) }))}
              >
                Remove this charge
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => setD((c) => ({ ...c, items: [...c.items, { description: "", qty: "1", rate: "" }] }))}
        >
          + Add a charge (late fee, meals, registration…)
        </button>
        <Field label="Already paid (optional)" value={d.paid} onChange={set("paid")} inputMode="decimal" />
        <p className="rounded-2xl bg-sage-soft px-4 py-3 font-bold">
          Amount due: {formatMoney(invoiceBalance(d), d.currency)}
          {parseAmount(d.paid) > 0 && (
            <span className="block text-sm font-normal text-ink-soft">
              Subtotal {formatMoney(invoiceSubtotal(d), d.currency)}
            </span>
          )}
        </p>
        <Field
          label="How to pay (optional)"
          value={d.paymentInfo}
          onChange={set("paymentInfo")}
          multiline
          placeholder="Venmo @little-acorns, Zelle (555) 123-4567, or cash/check at pick-up"
        />
        <Field label="Notes (optional)" value={d.notes} onChange={set("notes")} />
      </div>

      <Errors errors={errors} />
      <div className="sticky bottom-3 z-10">
        <button
          type="button"
          disabled={busy}
          onClick={() => download(validateInvoice, buildInvoicePdf, invoiceFileName)}
          className="btn-primary w-full text-lg"
        >
          {busy ? "Making your PDF…" : "Download invoice PDF"}
        </button>
      </div>
      {done && (
        <div className="card space-y-3">
          <p className="font-bold">Invoice downloaded.</p>
          <p className="text-ink-soft">The charges are kept, so the next family is quick if they pay the same rate.</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setD((c) => ({ ...c, parentName: "", parentContact: "", children: "", paid: "", invoiceNumber: "" }));
              setDone(false);
            }}
          >
            Invoice the next family
          </button>
        </div>
      )}
    </div>
  );
}
