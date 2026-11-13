import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-ink-soft sm:flex-row sm:justify-between">
        <p>
          © {new Date().getFullYear()} {SITE_NAME}. Made for home daycare providers.
        </p>
        <nav className="flex flex-wrap gap-4">
          <Link href="/tools/year-end-statement" className="hover:text-ink">
            Year-end statement
          </Link>
          <Link href="/tools" className="hover:text-ink">
            All free tools
          </Link>
        </nav>
      </div>
    </footer>
  );
}
