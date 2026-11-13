import Link from "next/link";

const features = [
  {
    emoji: "✍️",
    title: "Attendance that's always ready for licensing",
    body: "Parents tap to sign kids in and out on your phone. Times and signatures are saved by date, so a licensing visit is never a scramble through paper sheets.",
  },
  {
    emoji: "💵",
    title: "Know who's paid and who owes",
    body: "Record Venmo, Zelle, cash or check payments in two taps. Every family's balance is always up to date, and receipts go out by text or email.",
  },
  {
    emoji: "🧾",
    title: "Tax statements in one tap",
    body: "In January, every family gets a year-end statement built from the payments you already recorded. No more digging through a year of notes.",
  },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 pt-12 pb-10 sm:pt-20">
        <p className="mb-3 inline-block rounded-full bg-sage-soft px-3 py-1 text-sm font-semibold text-sage">
          Made by a former home daycare provider
        </p>
        <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
          The business side of home daycare, done by naptime.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Attendance, parent payments and year-end tax statements in one simple app on your phone. No sales calls, no
          center software, just what a home provider needs.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/tools/year-end-statement" className="btn-primary">
            Make a free year-end statement
          </Link>
          <Link href="/tools" className="btn-secondary">
            See all free tools
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="card">
            <div aria-hidden className="mb-3 text-3xl">
              {f.emoji}
            </div>
            <h2 className="text-lg font-bold">{f.title}</h2>
            <p className="mt-2 text-ink-soft">{f.body}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="mx-auto max-w-5xl px-4 pt-16">
        <div className="card flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-extrabold">One simple price</h2>
            <p className="mt-2 text-ink-soft">
              $15/month or $149/year after a 14-day free trial. No card needed to try it. Cancel anytime.
            </p>
            <p className="mt-2 font-semibold text-sage">The full app opens in March 2027.</p>
          </div>
          <Link href="/tools/year-end-statement" className="btn-primary shrink-0">
            Try a free tool today
          </Link>
        </div>
      </section>
    </>
  );
}
