import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-extrabold text-ink">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-2xl bg-peach text-lg text-white">
        ☾
      </span>
      {SITE_NAME}
    </span>
  );
}

export default function SiteHeader() {
  return (
    <header className="border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label={`${SITE_NAME} home`}>
          <Logo />
        </Link>
        <nav className="flex items-center gap-4 text-sm font-semibold">
          <Link href="/tools" className="text-ink-soft hover:text-ink">
            Free tools
          </Link>
          <Link href="/#pricing" className="hidden text-ink-soft hover:text-ink sm:inline">
            Pricing
          </Link>
        </nav>
      </div>
    </header>
  );
}
