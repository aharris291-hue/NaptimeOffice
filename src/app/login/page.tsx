"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Field from "@/components/Field";
import { Logo } from "@/components/SiteHeader";
import { isConfigured, missingSettings, supabase } from "@/lib/app/supabase";

// Sign in with a 6-digit code sent by email. Codes work better than links inside an
// installed home-screen app, because a link would open in the regular browser.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [asParent, setAsParent] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setAsParent(q.get("as") === "parent");
    if (q.get("email")) setEmail(q.get("email")!);
  }, []);

  async function sendCode() {
    setMsg(null);
    if (!isConfigured()) {
      return setMsg(`The app can't reach its database yet. In Vercel, add ${missingSettings().join(" and ")} under Settings → Environment Variables, then redeploy.`);
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg("Enter a valid email address.");
    setBusy(true);
    try {
      const { error } = await supabase().auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: asParent ? { role: "parent" } : undefined,
        },
      });
      if (error) {
        const rate = /rate limit|too many|security purposes/i.test(error.message);
        if (rate) return setMsg("Too many codes sent in a short time. Wait a few minutes, then try again.");
        if (/fetch|network/i.test(error.message)) return setMsg("We couldn't reach the database. Check your internet connection. If it keeps happening, the Supabase address in Vercel may be wrong.");
        return setMsg(`We couldn't send the code: ${error.message}`);
      }
      setStep("code");
    } catch (e) {
      setMsg(`We couldn't reach the database. Check your internet connection and try again. (${(e as Error).message})`);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setMsg(null);
    if (!/^\d{6}$/.test(code.trim())) return setMsg("Enter the 6-digit code from the email.");
    setBusy(true);
    try {
      const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (error) return setMsg("That code didn't work. Check the newest email and try again.");
      router.replace("/auth/callback");
    } catch (e) {
      setMsg(`We couldn't reach the database. (${(e as Error).message})`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 self-center"><Logo /></Link>
      <div className="card space-y-4">
        <h1 className="text-2xl font-extrabold">{step === "email" ? (asParent ? "Parent sign in" : "Sign in or start your free trial") : "Check your email"}</h1>
        {step === "email" ? (
          <>
            <p className="text-ink-soft">{asParent ? "Use the email address your daycare has on file. " : ""}We&apos;ll email you a sign-in link. No password to remember.</p>
            <Field label="Email" value={email} onChange={setEmail} autoComplete="email" />
            <button className="btn-primary w-full" disabled={busy} onClick={sendCode}>
              {busy ? "Sending…" : "Email me a sign-in link"}
            </button>
          </>
        ) : (
          <>
            <p className="text-ink-soft">
              We emailed <b>{email}</b>. Open the email on this device and tap <b>Sign in</b>. It can take a minute, and may land in spam or promotions.
            </p>
            <p className="text-sm text-ink-soft">If your email shows a 6-digit code instead, enter it here:</p>
            <Field label="6-digit code" value={code} onChange={setCode} inputMode="numeric" autoComplete="one-time-code" />
            <button className="btn-primary w-full" disabled={busy} onClick={verify}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button className="w-full text-sm font-semibold text-ink-soft" onClick={() => setStep("email")}>
              Use a different email
            </button>
          </>
        )}
        {msg && <p className="rounded-xl bg-peach-soft px-4 py-2 font-semibold text-peach-dark">{msg}</p>}
      </div>
    </div>
  );
}
