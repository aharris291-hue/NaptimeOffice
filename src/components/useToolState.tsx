"use client";

import { useEffect, useState } from "react";
import { downloadBlob, loadProvider, saveProvider } from "@/lib/provider";

/** Form state that pre-fills provider details saved on this device, plus a download helper. */
export function useToolState<T extends object>(initial: () => T) {
  const [d, setD] = useState<T>(initial);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setD((cur) => {
      const saved = loadProvider();
      const pick = Object.fromEntries(Object.entries(saved).filter(([k]) => k in cur && k !== "taxId"));
      return { ...cur, ...pick };
    });
  }, []);

  const set =
    <K extends keyof T>(key: K) =>
    (value: T[K]) =>
      setD((cur) => ({ ...cur, [key]: value }));

  async function download(validate: (d: T) => string[], build: (d: T) => Promise<Blob>, fileName: (d: T) => string) {
    const problems = validate(d);
    setErrors(problems);
    if (problems.length) return;
    setBusy(true);
    try {
      saveProvider(d as Record<string, unknown>);
      downloadBlob(await build(d), fileName(d));
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return { d, setD, set, busy, errors, done, setDone, download };
}

export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      {errors.map((e) => (
        <p key={e} className="rounded-xl bg-peach-soft px-4 py-2 font-semibold text-peach-dark">
          {e}
        </p>
      ))}
    </div>
  );
}
