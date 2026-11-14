"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Field from "@/components/Field";
import { Logo } from "@/components/SiteHeader";
import { isConfigured, supabase } from "@/lib/app/supabase";

// Sign in with a 6-digit code sent by email. Codes work better than links inside an
// installed home-screen app, because a link would open in the regular browser.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sendCode() {
    setMsg(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setMsg("Enter a valid email address.");
    setBusy(true);
    const { error } = await supabase().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return setMsg(error.message);
    setStep("code");
  }

  async function verify() {
    setMsg(null);
    setBusy(true);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) return setMsg("That code didn't work. Check the newest email and try again.");
    router.replace("/app");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 self-center"><Logo /></Link>
      <div className="card space-y-4">
        <h1 className="text-2xl font-extrabold">{step === "email" ? "Sign in or start your free trial" : "Check your email"}</h1>
        {!isConfigured() && <p className="text-peach-dark">The app isn&apos;t connected to its database yet.</p>}
        {step === "email" ? (
          <>
            <p className="text-ink-soft">We&apos;ll email you a 6-digit code. No password to remember.</p>
            <Field label="Email" value={email} onChange={setEmail} autoComplete="email" />
            <button className="btn-primary w-full" disabled={busy || !isConfigured()} onClick={sendCode}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </>
        ) : (
          <>
            <p className="text-ink-soft">Enter the code we sent to {email}.</p>
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
