"use client";

import Field from "@/components/Field";
import type { ProviderInfo } from "@/lib/provider";

export default function ProviderFields<T extends ProviderInfo>(props: {
  value: T;
  set: <K extends keyof T>(key: K) => (v: T[K]) => void;
  showCurrency?: boolean;
}) {
  const { value: d, set } = props;
  return (
    <div className="card space-y-4">
      <h2 className="text-xl font-bold">Your details</h2>
      <p className="-mt-2 text-sm text-ink-soft">Remembered on this device so you only type them once.</p>
      <Field label="Your name" value={d.providerName} onChange={set("providerName") as (v: string) => void} autoComplete="name" />
      <Field
        label="Daycare name (optional)"
        value={d.businessName}
        onChange={set("businessName") as (v: string) => void}
        placeholder="Little Acorns Home Daycare"
      />
      <Field label="Your address" value={d.providerAddress} onChange={set("providerAddress") as (v: string) => void} multiline />
      <Field
        label="Phone or email (optional)"
        value={d.providerContact}
        onChange={set("providerContact") as (v: string) => void}
      />
      {props.showCurrency !== false && (
        <Field
          label="Currency symbol"
          value={d.currency}
          onChange={set("currency") as (v: string) => void}
          placeholder="$, £, €, A$…"
        />
      )}
    </div>
  );
}
