"use client";

import { useEffect, useRef } from "react";

/** Bottom sheet dialog used for check-in/out and quick forms. */
export default function Sheet(props: { title: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef(props.onClose);
  close.current = props.onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 sm:items-center" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{props.title}</h2>
          <button onClick={props.onClose} className="rounded-full px-3 py-1 text-2xl text-ink-soft" aria-label="Close">×</button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
