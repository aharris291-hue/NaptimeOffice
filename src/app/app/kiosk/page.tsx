"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app/AuthGate";
import SignaturePad from "@/components/app/SignaturePad";
import PickupPhoto from "@/components/app/PickupPhoto";
import { useAttendance, useRoster } from "@/lib/app/data";
import { QR_PREFIX, pinHash, signInChild, signOutChild } from "@/lib/app/checkin";
import { clock, lateFee, lateMinutes, localDate } from "@/lib/app/time";
import type { Child, Contact } from "@/lib/app/types";
import { formatMoney } from "@/lib/pdfKit";

type Detector = { detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/** A shared tablet by the door: parents sign their children in and out with a PIN or QR card. */
export default function Kiosk() {
  const router = useRouter();
  const { provider } = useApp();
  const roster = useRoster();
  const { rows, reload } = useAttendance(localDate());
  const [pin, setPin] = useState("");
  const [who, setWho] = useState<Contact | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [fails, setFails] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function tryPin(value: string) {
    if (Date.now() < lockedUntil) return setMsg("Too many tries. Please wait a minute.");
    const hash = await pinHash(provider.id, value);
    const match = roster.data?.contacts.find((c) => c.pin_hash === hash && c.can_pickup);
    setPin("");
    if (!match) {
      const n = fails + 1;
      setFails(n);
      if (n >= 5) {
        setLockedUntil(Date.now() + 60000);
        setFails(0);
      }
      return setMsg("That PIN didn't match. Try again.");
    }
    setFails(0);
    setMsg(null);
    setWho(match);
  }

  function press(d: string) {
    setMsg(null);
    const next = (pin + d).slice(0, 6);
    setPin(next);
  }

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(null), 4000);
    return () => clearTimeout(t);
  }, [done]);

  if (roster.error) return <p className="p-6 text-peach-dark">{roster.error}</p>;
  if (!roster.data || !rows) return <p className="p-6 text-ink-soft">Loading…</p>;

  if (who) {
    return (
      <Frame onExit={() => setWho(null)} exitLabel="Cancel">
        <FamilyCheck
          contact={who}
          kids={roster.data.children.filter((c) => c.family_id === who.family_id && c.active)}
          rows={rows}
          onDone={(text) => { setWho(null); setDone(text); reload(); }}
        />
      </Frame>
    );
  }

  return (
    <Frame onExit={() => { if (confirm("Leave check-in mode?")) router.push("/app"); }} exitLabel="Exit">
      <div className="mx-auto max-w-sm space-y-5 text-center">
        <h1 className="text-3xl font-extrabold">Welcome to {provider.business_name || "daycare"}!</h1>
        {done ? (
          <p className="rounded-3xl bg-sage-soft p-6 text-xl font-bold">✓ {done}</p>
        ) : (
          <p className="text-lg text-ink-soft">Enter your PIN to sign in or out.</p>
        )}
        <div className="flex justify-center gap-3" aria-label="PIN entered">
          {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
            <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-ink" : "bg-line"}`} />
          ))}
        </div>
        {msg && <p className="font-semibold text-peach-dark">{msg}</p>}
        <div className="grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} onClick={() => press(d)} className="rounded-3xl bg-paper py-5 text-3xl font-bold shadow">{d}</button>
          ))}
          <button onClick={() => setPin(pin.slice(0, -1))} className="rounded-3xl py-5 text-xl font-bold text-ink-soft">⌫</button>
          <button onClick={() => press("0")} className="rounded-3xl bg-paper py-5 text-3xl font-bold shadow">0</button>
          <button onClick={() => pin.length >= 4 && tryPin(pin)} disabled={pin.length < 4} className="rounded-3xl bg-peach py-5 text-xl font-bold text-white disabled:opacity-40">Go</button>
        </div>
        <button className="btn-secondary w-full" onClick={() => setScanning(true)}>📷 Scan my QR card</button>
        {scanning && <Scanner onCode={(code) => { setScanning(false); tryPin(code); }} onClose={() => setScanning(false)} />}
      </div>
    </Frame>
  );
}

function Frame({ children, onExit, exitLabel }: { children: React.ReactNode; onExit: () => void; exitLabel: string }) {
  return (
    <div className="min-h-screen bg-cream px-4 py-6">
      <div className="mb-4 flex justify-end"><button className="text-sm font-semibold text-ink-soft" onClick={onExit}>{exitLabel}</button></div>
      {children}
    </div>
  );
}

function FamilyCheck({ contact, kids, rows, onDone }: { contact: Contact; kids: Child[]; rows: import("@/lib/app/types").Attendance[]; onDone: (text: string) => void }) {
  const { provider } = useApp();
  const openRow = (c: Child) => rows.find((r) => r.child_id === c.id && r.check_in && !r.check_out);
  const [chosen, setChosen] = useState<string[]>(kids.map((k) => k.id));
  const [sig, setSig] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const goingOut = kids.filter((k) => chosen.includes(k.id) && openRow(k));
  const late = goingOut.length ? lateMinutes(new Date(), provider) : 0;
  const fee = lateFee(late, provider) * goingOut.length;

  async function confirm() {
    if (!chosen.length) return setErr("Choose at least one child.");
    if (!sig) return setErr("Please sign in the box.");
    setBusy(true);
    const names: string[] = [];
    for (const k of kids.filter((x) => chosen.includes(x.id))) {
      const row = openRow(k);
      const r = row ? await signOutChild(provider, row, contact.full_name, sig) : await signInChild(provider, k, contact.full_name, sig);
      if (r.error) { setBusy(false); return setErr(r.error.message); }
      names.push(`${k.first_name} ${row ? "signed out" : "signed in"}`);
    }
    onDone(`${names.join(", ")} at ${clock(new Date().toISOString())}. Thank you, ${contact.full_name.split(" ")[0]}!`);
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center gap-3">
        <PickupPhoto path={contact.photo_path} name={contact.full_name} size={64} />
        <h1 className="text-2xl font-extrabold">Hi, {contact.full_name.split(" ")[0]}!</h1>
      </div>
      {kids.length === 0 && <p className="card">No children found for your family. Please see your provider.</p>}
      {kids.map((k) => {
        const row = openRow(k);
        const on = chosen.includes(k.id);
        return (
          <button key={k.id} onClick={() => setChosen(on ? chosen.filter((x) => x !== k.id) : [...chosen, k.id])}
            className={`flex w-full items-center justify-between rounded-3xl border-4 bg-paper p-4 text-left ${on ? "border-peach" : "border-transparent"}`}>
            <span>
              <span className="block text-xl font-bold">{k.first_name}</span>
              <span className="text-ink-soft">{row ? `Here since ${clock(row.check_in)}` : "Not here yet"}</span>
            </span>
            <span className={`rounded-full px-3 py-1 font-bold ${row ? "bg-sun" : "bg-sage-soft"}`}>{on ? (row ? "Sign out" : "Sign in") : "Skip"}</span>
          </button>
        );
      })}
      <SignaturePad onChange={setSig} />
      {fee > 0 && <p className="rounded-xl bg-sun/40 px-3 py-2 text-sm font-semibold">Pick-up is {late} minutes after closing. A late fee of {formatMoney(fee, provider.currency)} applies.</p>}
      {err && <p className="font-semibold text-peach-dark">{err}</p>}
      <button className="btn-primary w-full py-4 text-lg" disabled={busy} onClick={confirm}>{busy ? "Saving…" : "Confirm"}</button>
    </div>
  );
}

function Scanner({ onCode, onClose }: { onCode: (pin: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onCode);
  cb.current = onCode;
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    if (!W.BarcodeDetector) {
      setErr("This tablet can't scan QR codes. Please type your PIN instead.");
      return;
    }
    const detector = new W.BarcodeDetector({ formats: ["qr_code"] });
    let stream: MediaStream | null = null;
    let stop = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then(async (s) => {
        stream = s;
        if (!video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        while (!stop) {
          const found = await detector.detect(video.current).catch(() => []);
          const hit = found.find((f) => f.rawValue.startsWith(QR_PREFIX));
          if (hit) return cb.current(hit.rawValue.slice(QR_PREFIX.length));
          await new Promise((r) => setTimeout(r, 300));
        }
      })
      .catch(() => setErr("Camera access was blocked. Please type your PIN instead."));
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-ink/80 p-6">
      {err ? <p className="rounded-2xl bg-paper p-4 font-semibold">{err}</p> : <video ref={video} playsInline muted className="w-full max-w-sm rounded-3xl" />}
      <p className="text-white">Hold your QR card up to the camera.</p>
      <button className="btn-secondary" onClick={onClose}>Cancel</button>
    </div>
  );
}
