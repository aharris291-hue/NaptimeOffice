"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/SiteHeader";
import { isConfigured, supabase } from "@/lib/app/supabase";

// The sign-in link in the email lands here. Supabase puts the session in the address,
// the client reads it, and we send the provider to their Today screen.
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const problem = hash.get("error_description") || query.get("error_description");
    if (problem) {
      setError(/expired|invalid/i.test(problem) ? "That sign-in link has expired or was already used. Ask for a new one." : problem);
      return;
    }
    if (!isConfigured()) {
      setError("The app isn't connected to its database yet.");
      return;
    }
    const sb = supabase();
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      router.replace("/app");
    };
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => session && go());
    sb.auth.getSession().then(({ data }) => (data.session ? go() : null));
    const t = setTimeout(() => !done && setError("We couldn't finish signing you in. Ask for a new link and open it on this device."), 8000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [router]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10 text-center">
      <Link href="/" className="mb-8 self-center"><Logo /></Link>
      {error ? (
        <div className="card space-y-4">
          <p className="font-bold text-peach-dark">{error}</p>
          <Link href="/login" className="btn-primary">Back to sign in</Link>
        </div>
      ) : (
        <p className="text-ink-soft">Signing you in…</p>
      )}
    </div>
  );
}
