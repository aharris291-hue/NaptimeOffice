// Shared sign-in / sign-out writes, used by the Today screen and the parent kiosk.
import { supabase } from "./supabase";
import { lateFee, lateMinutes, localDate } from "./time";
import type { Attendance, Child, Provider } from "./types";

export async function signInChild(provider: Provider, child: Child, by: string, signature: string) {
  return supabase().from("attendance").insert({
    provider_id: provider.id,
    child_id: child.id,
    care_date: localDate(),
    check_in: new Date().toISOString(),
    in_by: by,
    in_signature: signature,
  });
}

export async function signOutChild(provider: Provider, row: Attendance, by: string, signature: string) {
  const now = new Date();
  const late = lateMinutes(now, provider);
  return supabase()
    .from("attendance")
    .update({ check_out: now.toISOString(), out_by: by, out_signature: signature, late_minutes: late, late_fee: lateFee(late, provider) })
    .eq("id", row.id);
}

/** Kiosk PINs are stored only as a hash tied to the provider, never as the digits themselves. */
export async function pinHash(providerId: string, pin: string) {
  const data = new TextEncoder().encode(`naptime:${providerId}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const QR_PREFIX = "naptime-pin:";
