"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "@/lib/app/supabase";
import type { Provider } from "@/lib/app/types";
import { Logo } from "@/components/SiteHeader";

type Ctx = { session: Session; provider: Provider; reloadProvider: () => Promise<void> };
const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp must be used inside AuthGate");
  return v;
}

const NAV = [
  { href: "/app", label: "Today", icon: "☀️" },
  { href: "/app/families", label: "Families", icon: "👪" },
  { href: "/app/history", label: "Records", icon: "📋" },
  { href: "/app/settings", label: "Settings", icon: "⚙️" },
];

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reloadProvider = useCallback(async () => {
    const { data, error } = await supabase().from("providers").select("*").single();
    if (error) setError(error.message);
    else setProvider(data as Provider);
  }, []);

  useEffect(() => {
    if (!isConfigured()) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/login");
    if (session) reloadProvider();
  }, [session, router, reloadProvider]);

  if (!isConfigured()) {
    return (
      <Centered>
        <p className="font-bold">The app isn&apos;t connected to its database yet.</p>
        <p className="mt-2 text-ink-soft">Add the Supabase settings in Vercel, then redeploy.</p>
      </Centered>
    );
  }
  if (error) return <Centered><p className="font-bold text-peach-dark">{error}</p></Centered>;
  if (!session || !provider) return <Centered><p className="text-ink-soft">Loading…</p></Centered>;

  return (
    <AppCtx.Provider value={{ session, provider, reloadProvider }}>
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col pb-24">
        <header className="flex items-center justify-between px-4 py-3">
          <Logo />
          <span className="truncate pl-3 text-sm text-ink-soft">{provider.business_name || provider.email}</span>
        </header>
        <main className="flex-1 px-4">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((n) => {
            const active = n.href === "/app" ? path === "/app" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${active ? "text-peach-dark" : "text-ink-soft"}`}
              >
                <span aria-hidden className="text-xl">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </AppCtx.Provider>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center px-6 text-center"><div>{children}</div></div>;
}
