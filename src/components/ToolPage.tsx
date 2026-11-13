export type Faq = { q: string; a: string };

export default function ToolPage(props: { title: string; intro: string; faqs: Faq[]; children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: props.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">{props.title}</h1>
      <p className="mt-3 text-lg text-ink-soft">{props.intro}</p>
      <div className="mt-8">{props.children}</div>
      {props.faqs.length > 0 && (
        <section className="mt-14 space-y-6">
          <h2 className="text-2xl font-extrabold">Common questions</h2>
          {props.faqs.map((f) => (
            <div key={f.q}>
              <h3 className="font-bold">{f.q}</h3>
              <p className="mt-1 text-ink-soft">{f.a}</p>
            </div>
          ))}
        </section>
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
