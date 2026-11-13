import type { Metadata } from "next";
import StatementForm from "@/components/StatementForm";

export const metadata: Metadata = {
  title: "Free daycare year-end tax statement generator",
  description:
    "Make a year-end child care statement for each daycare family in minutes. Includes everything parents need for IRS Form 2441 or an FSA claim. Free PDF, no sign-up.",
  alternates: { canonical: "/tools/year-end-statement" },
};

const faqs = [
  {
    q: "What do parents need from their daycare provider at tax time?",
    a: "To claim the US Child and Dependent Care Credit on IRS Form 2441, parents need the provider's name, address, taxpayer ID (an EIN or Social Security number) and the total they paid during the year. This statement includes all four.",
  },
  {
    q: "Should I use my EIN or my Social Security number?",
    a: "Either is accepted for Form 2441. Many home providers get a free EIN from the IRS so they don't have to hand out their Social Security number. Your tax ID is only used to make the PDF and is never sent anywhere.",
  },
  {
    q: "Can parents use this for their dependent care FSA?",
    a: "Usually, yes. Most FSA administrators accept a provider statement that shows the dates of care, the amount paid and the provider's details. Some have their own form, so parents should check with their plan.",
  },
  {
    q: "Is this tax advice?",
    a: "No. It's a record of payments you received. For questions about your own taxes, talk to a tax professional.",
  },
];

export default function YearEndStatementPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Free daycare year-end tax statement</h1>
      <p className="mt-3 text-lg text-ink-soft">
        Fill this in once for your daycare, then make a statement for each family in about a minute. You get a clean
        PDF to print, email or text. Everything stays on your device.
      </p>

      <div className="mt-8">
        <StatementForm />
      </div>

      <section className="mt-14 space-y-6">
        <h2 className="text-2xl font-extrabold">Common questions</h2>
        {faqs.map((f) => (
          <div key={f.q}>
            <h3 className="font-bold">{f.q}</h3>
            <p className="mt-1 text-ink-soft">{f.a}</p>
          </div>
        ))}
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
