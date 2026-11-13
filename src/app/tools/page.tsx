import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free tools for home daycare providers",
  description:
    "Free year-end childcare tax statements, invoices, receipts and attendance sheets for home daycare providers. No sign-up needed.",
};

const tools = [
  {
    href: "/tools/year-end-statement",
    title: "Year-end childcare statement",
    body: "Give each family the yearly statement they need for taxes or their FSA.",
    ready: true,
  },
  { href: "#", title: "Daycare receipt", body: "A clean receipt for any payment.", ready: false },
  { href: "#", title: "Daycare invoice", body: "Bill a family for a week or month of care.", ready: false },
  { href: "#", title: "Printable attendance sheet", body: "A weekly sign-in and sign-out sheet.", ready: false },
];

export default function ToolsPage() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-extrabold sm:text-4xl">Free tools for home daycare providers</h1>
      <p className="mt-3 max-w-2xl text-ink-soft">
        Everything runs in your browser. Nothing you type is uploaded or saved on our servers.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {tools.map((t) =>
          t.ready ? (
            <Link key={t.title} href={t.href} className="card block transition hover:border-peach">
              <h2 className="text-lg font-bold">{t.title}</h2>
              <p className="mt-1 text-ink-soft">{t.body}</p>
              <span className="mt-3 inline-block font-bold text-peach-dark">Open tool →</span>
            </Link>
          ) : (
            <div key={t.title} className="card opacity-70">
              <h2 className="text-lg font-bold">{t.title}</h2>
              <p className="mt-1 text-ink-soft">{t.body}</p>
              <span className="mt-3 inline-block text-sm font-semibold text-ink-soft">Coming soon</span>
            </div>
          ),
        )}
      </div>
    </section>
  );
}
