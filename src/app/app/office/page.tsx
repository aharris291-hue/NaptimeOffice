"use client";

import Link from "next/link";
import { useRows } from "@/lib/app/data";
import { docStatus } from "@/lib/app/office";
import type { DocumentRow } from "@/lib/app/types";

const LINKS = [
  { href: "/app/office/expenses", icon: "🧾", title: "Expenses", body: "Snap receipts and log what you spend." },
  { href: "/app/office/taxes", icon: "📊", title: "Taxes and year-end statements", body: "Income, deductions, time-space percentage, and statements for parents." },
  { href: "/app/office/documents", icon: "📁", title: "Documents", body: "Immunizations, licenses and certificates, with expiry reminders." },
  { href: "/app/history", icon: "📋", title: "Attendance records", body: "Every sign-in and sign-out, with a monthly download." },
];

export default function OfficePage() {
  const { rows } = useRows<DocumentRow>("documents", "expires_on", true);
  const due = (rows ?? []).filter((d) => ["expired", "soon"].includes(docStatus(d))).length;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Office</h1>
      <ul className="space-y-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="card flex items-center gap-3 py-3">
              <span className="text-3xl" aria-hidden>{l.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  {l.title}
                  {l.href.endsWith("documents") && due > 0 && <span className="ml-2 rounded-full bg-peach px-2 py-0.5 text-xs text-white">{due} need attention</span>}
                </span>
                <span className="text-sm text-ink-soft">{l.body}</span>
              </span>
              <span className="text-ink-soft" aria-hidden>›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
