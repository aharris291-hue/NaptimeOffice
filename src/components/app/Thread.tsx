"use client";

import { clock, localDate } from "@/lib/app/time";
import type { Message } from "@/lib/app/types";
import { prettyDate } from "@/lib/pdfKit";

/** A simple message thread between a family and their provider. */
export default function Thread(props: { messages: Message[]; mine: (m: Message) => boolean; text: string; setText: (s: string) => void; onSend: (e: React.FormEvent) => void; err: string | null; notice?: string }) {
  return (
    <div className="space-y-3">
      <div className="max-h-[50vh] space-y-2 overflow-y-auto">
        {props.messages.length === 0 && <p className="text-sm text-ink-soft">No messages yet.</p>}
        {props.messages.map((m) => (
          <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${props.mine(m) ? "ml-auto bg-peach-soft" : "bg-cream"}`}>
            <p className="whitespace-pre-line">{m.body}</p>
            <p className="mt-1 text-xs text-ink-soft">{m.sender_name} · {clock(m.created_at)}{localDate(new Date(m.created_at)) !== localDate() ? `, ${prettyDate(localDate(new Date(m.created_at)))}` : ""}</p>
          </div>
        ))}
      </div>
      {props.notice && <p className="rounded-xl bg-sage-soft px-3 py-2 text-sm">🌙 {props.notice}</p>}
      <form onSubmit={props.onSend} className="flex gap-2">
        <input className="field-input" placeholder="Write a message" value={props.text} onChange={(e) => props.setText(e.target.value)} />
        <button className="btn-primary shrink-0 px-4">Send</button>
      </form>
      {props.err && <p className="font-semibold text-peach-dark">{props.err}</p>}
    </div>
  );
}

