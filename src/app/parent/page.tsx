"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { Logo } from "@/components/SiteHeader";
import Sheet from "@/components/app/Sheet";
import Thread from "@/components/app/Thread";
import { isConfigured, supabase } from "@/lib/app/supabase";
import { fetchAll, inQuietHours, photoUrls } from "@/lib/app/data";
import { familyBalance, invoicePdf, paidOn, shareOrDownload } from "@/lib/app/billing";
import { duration, entryText, incidentPdf, kindInfo, minutesBetween } from "@/lib/app/care";
import { ageLabel, clock, localDate } from "@/lib/app/time";
import type { Announcement, Attendance, Child, Contact, DailyEntry, Family, Incident, Invoice, Message, Payment, Photo, Provider, Supply } from "@/lib/app/types";
import { formatMoney, prettyDate } from "@/lib/pdfKit";

type Home = {
  me: Contact;
  family: Family;
  provider: Provider;
  kids: Child[];
  attendance: Attendance[];
  entries: DailyEntry[];
  supplies: Supply[];
  incidents: Incident[];
  invoices: Invoice[];
  payments: Payment[];
  photos: Photo[];
  urls: Record<string, string>;
  announcements: Announcement[];
  messages: Message[];
};

export default function ParentHome() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [home, setHome] = useState<Home | null>(null);
  const [state, setState] = useState<"loading" | "unlinked" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [kidId, setKidId] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured()) return;
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (s: Session) => {
    const sb = supabase();
    try {
      const own = await sb.from("providers").select("id").eq("id", s.user.id).maybeSingle();
      if (own.data) return router.replace("/app");
      await sb.rpc("claim_parent_invites");
      const mine = await sb.from("contacts").select("*").eq("user_id", s.user.id);
      if (mine.error) throw new Error(mine.error.message);
      const me = (mine.data as Contact[])[0];
      if (!me) return setState("unlinked");
      const today = localDate();
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [fam, prov, kids] = await Promise.all([
        sb.from("families").select("*").eq("id", me.family_id).single(),
        sb.from("families").select("provider_id").eq("id", me.family_id).single().then(async (r) => sb.from("providers").select("*").eq("id", (r.data as { provider_id: string }).provider_id).single()),
        sb.from("children").select("*").eq("family_id", me.family_id).eq("active", true).order("first_name"),
      ]);
      const kidIds = ((kids.data ?? []) as Child[]).map((k) => k.id);
      const [att, ent, sup, inc, invoices, payments, photos, ann, msg] = await Promise.all([
        sb.from("attendance").select("*").eq("care_date", today).in("child_id", kidIds),
        sb.from("daily_entries").select("*").eq("care_date", today).in("child_id", kidIds).order("started_at"),
        sb.from("supplies").select("*").in("child_id", kidIds),
        sb.from("incidents").select("*").in("child_id", kidIds).order("happened_at", { ascending: false }).limit(20),
        fetchAll<Invoice>((a, b) => sb.from("invoices").select("*").eq("family_id", me.family_id).order("issue_date", { ascending: false }).range(a, b)),
        fetchAll<Payment>((a, b) => sb.from("payments").select("*").eq("family_id", me.family_id).order("paid_on", { ascending: false }).range(a, b)),
        sb.from("photos").select("*").gte("taken_on", localDate(since)).order("created_at", { ascending: false }).limit(60),
        sb.from("announcements").select("*").order("publish_at", { ascending: false }).limit(10),
        sb.from("messages").select("*").eq("family_id", me.family_id).order("created_at").limit(200),
      ]);
      const err = fam.error || prov.error || kids.error || att.error || ent.error || photos.error || ann.error || msg.error;
      if (err) throw new Error(err.message);
      const ph = photos.data as Photo[];
      setHome({
        me,
        family: fam.data as Family,
        provider: prov.data as Provider,
        kids: kids.data as Child[],
        attendance: att.data as Attendance[],
        entries: ent.data as DailyEntry[],
        supplies: (sup.data ?? []) as Supply[],
        incidents: (inc.data ?? []) as Incident[],
        invoices,
        payments,
        photos: ph,
        urls: await photoUrls(ph.map((p) => p.path)),
        announcements: ann.data as Announcement[],
        messages: msg.data as Message[],
      });
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("error");
    }
  }, [router]);

  useEffect(() => {
    if (session === null) router.replace("/login?as=parent");
    if (session) load(session);
  }, [session, load, router]);

  useEffect(() => {
    if (!session || state !== "ready") return;
    const t = setInterval(() => load(session), 60000);
    return () => clearInterval(t);
  }, [session, state, load]);

  async function signOut() {
    await supabase().auth.signOut();
    router.replace("/login?as=parent");
  }

  if (!isConfigured()) return <Center>The app isn&apos;t connected yet.</Center>;
  if (state === "loading") return <Center>Loading…</Center>;
  if (state === "error") return <Center><span className="text-peach-dark">{error}</span></Center>;
  if (state === "unlinked" || !home) {
    return (
      <Center>
        <p className="font-bold">You&apos;re signed in as {session?.user.email}.</p>
        <p className="mt-2 text-ink-soft">Your daycare hasn&apos;t invited this email address yet. Ask them to tap &quot;Invite to parent app&quot; on your contact card, then reload this page.</p>
        <button className="btn-secondary mt-4" onClick={signOut}>Sign out</button>
      </Center>
    );
  }

  const h = home;
  const kid = h.kids.find((k) => k.id === kidId) ?? h.kids[0];
  const money = (n: number) => formatMoney(n, h.provider.currency);
  const balance = familyBalance(h.family.id, h.invoices, h.payments);
  const quiet = inQuietHours(h.provider.dnd_start, h.provider.dnd_end);
  const unreadFromProvider = h.messages.filter((m) => !m.from_parent && !m.read_at).length;

  return (
    <div className="space-y-5 pt-3">
      <header className="flex items-center justify-between">
        <Logo />
        <button className="text-sm font-semibold text-ink-soft" onClick={signOut}>Sign out</button>
      </header>
      <div>
        <h1 className="text-2xl font-extrabold">{h.provider.business_name || h.provider.provider_name}</h1>
        {h.provider.phone && <a href={`tel:${h.provider.phone}`} className="font-semibold text-peach-dark">📞 {h.provider.phone}</a>}
      </div>
      {quiet && (
        <p className="rounded-2xl bg-sage-soft px-4 py-3 text-sm">
          🌙 Quiet time until {clock(`2000-01-01T${h.provider.dnd_end}`)}. {h.provider.dnd_note || "Messages will be read after naptime. For emergencies, please call."}
        </p>
      )}

      {h.kids.length > 1 && (
        <div className="flex gap-2">
          {h.kids.map((k) => (
            <button key={k.id} onClick={() => setKidId(k.id)} className={`rounded-full border-2 px-4 py-1 font-bold ${k.id === kid?.id ? "border-peach bg-peach-soft" : "border-line"}`}>{k.first_name}</button>
          ))}
        </div>
      )}

      {kid && <KidToday kid={kid} h={h} />}

      <button className="card flex w-full items-center justify-between py-3 text-left" onClick={() => setChat(true)}>
        <span className="font-bold">💬 Messages</span>
        {unreadFromProvider > 0 ? <span className="rounded-full bg-peach px-2 py-0.5 text-xs font-bold text-white">{unreadFromProvider} new</span> : <span className="text-ink-soft">›</span>}
      </button>

      {h.announcements.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Announcements</h2>
          {h.announcements.map((a) => (
            <div key={a.id} className="card py-3">
              <p className="font-bold">{a.title}</p>
              <p className="whitespace-pre-line text-sm">{a.body}</p>
              <p className="mt-1 text-xs text-ink-soft">{prettyDate(localDate(new Date(a.publish_at)))}</p>
            </div>
          ))}
        </section>
      )}

      {h.photos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold">Photos</h2>
          <div className="grid grid-cols-3 gap-1">
            {h.photos.map((p) => h.urls[p.path] && (
              // eslint-disable-next-line @next/next/no-img-element
              <button key={p.id} onClick={() => setPhoto(p.path)}><img src={h.urls[p.path]} alt={p.caption || "Photo"} className="aspect-square w-full rounded-lg object-cover" /></button>
            ))}
          </div>
        </section>
      )}

      <section className="card space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Billing</h2>
          <span className={`font-bold ${balance > 0 ? "text-peach-dark" : "text-sage"}`}>{balance > 0 ? `You owe ${money(balance)}` : "All paid up"}</span>
        </div>
        {h.provider.payment_info && <p className="whitespace-pre-line text-sm text-ink-soft">How to pay: {h.provider.payment_info}</p>}
        {h.invoices.slice(0, 6).map((inv) => {
          const left = Math.round((Number(inv.total) - paidOn(inv, h.payments)) * 100) / 100;
          return (
            <div key={inv.id} className="flex items-center justify-between border-t border-line pt-2 text-sm">
              <span>#{inv.number} · {prettyDate(inv.period_start)}<span className="block text-ink-soft">{left > 0 ? `${money(left)} due${inv.due_date ? ` by ${prettyDate(inv.due_date)}` : ""}` : "Paid"}</span></span>
              <button className="font-bold text-peach-dark" onClick={async () => {
                const { blob, name } = await invoicePdf(inv, h.provider, h.family, h.kids, h.me, paidOn(inv, h.payments));
                await shareOrDownload(blob, name, `Invoice #${inv.number}`);
              }}>PDF</button>
            </div>
          );
        })}
      </section>

      {chat && (
        <Sheet title="Messages" onClose={() => { setChat(false); if (session) load(session); }}>
          <ParentChat h={h} onSent={() => session && load(session)} quiet={quiet} />
        </Sheet>
      )}
      {photo && (
        <Sheet title="Photo" onClose={() => setPhoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={h.urls[photo]} alt="" className="w-full rounded-2xl" />
          <p className="mt-2 text-sm">{h.photos.find((p) => p.path === photo)?.caption}</p>
          <a href={h.urls[photo]} download className="btn-secondary mt-3 w-full">Save photo</a>
        </Sheet>
      )}
    </div>
  );
}

function KidToday({ kid, h }: { kid: Child; h: Home }) {
  const att = h.attendance.filter((a) => a.child_id === kid.id);
  const open = att.find((a) => a.check_in && !a.check_out);
  const last = att[att.length - 1];
  const entries = h.entries.filter((e) => e.child_id === kid.id);
  const nap = entries.find((e) => e.kind === "nap" && !e.ended_at);
  const needs = h.supplies.filter((s) => s.child_id === kid.id && s.level !== "plenty");
  const incidents = h.incidents.filter((i) => i.child_id === kid.id).slice(0, 3);
  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-extrabold">{kid.first_name}</h2>
          <p className="text-sm text-ink-soft">{ageLabel(kid.birth_date)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${nap ? "bg-sage text-white" : open ? "bg-sage-soft" : "bg-line"}`}>
          {nap ? `😴 Napping ${duration(minutesBetween(nap.started_at, null))}` : open ? `At daycare since ${clock(open.check_in)}` : last?.check_out ? `Went home ${clock(last.check_out)}` : "Not checked in today"}
        </span>
      </div>
      {needs.length > 0 && <p className="rounded-xl bg-sun/40 px-3 py-2 text-sm font-semibold">Please bring: {needs.map((n) => n.item.toLowerCase()).join(", ")}</p>}
      {entries.length === 0 ? (
        <p className="text-sm text-ink-soft">No updates yet today.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-2"><span aria-hidden>{kindInfo(e.kind).icon}</span><span>{e.kind !== "nap" && <b className="mr-1">{clock(e.started_at)}</b>}{entryText(e)}</span></li>
          ))}
        </ul>
      )}
      {incidents.map((i) => (
        <div key={i.id} className="flex items-center justify-between rounded-xl bg-peach-soft px-3 py-2 text-sm">
          <span><b>{i.kind} report</b> · {prettyDate(localDate(new Date(i.happened_at)))}</span>
          <button className="font-bold text-peach-dark" onClick={async () => {
            const { blob, name } = await incidentPdf(i, kid, h.provider);
            await shareOrDownload(blob, name, `${i.kind} report for ${kid.first_name}`);
          }}>View</button>
        </div>
      ))}
    </section>
  );
}

function ParentChat({ h, onSent, quiet }: { h: Home; onSent: () => void; quiet: boolean }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabase().rpc("mark_messages_read", { fam: h.family.id });
  }, [h.family.id]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const { error } = await supabase().from("messages").insert({
      provider_id: h.provider.id,
      family_id: h.family.id,
      from_parent: true,
      sender_name: h.me.full_name,
      body: text.trim(),
    });
    if (error) return setErr(error.message);
    setText("");
    onSent();
  }
  return <Thread messages={h.messages} mine={(m) => m.from_parent} text={text} setText={setText} onSend={send} err={err}
    notice={quiet ? "It's quiet time right now, so your message will be read after naptime. For emergencies, please call." : undefined} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center text-center"><div className="max-w-sm">{children}</div></div>;
}
