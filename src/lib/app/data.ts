"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Attendance, Child, Contact, Family, Invoice, Payment } from "./types";

export type Roster = { families: Family[]; children: Child[]; contacts: Contact[] };

/** Loads every family, child and contact for the signed-in provider. */
export function useRoster() {
  const [data, setData] = useState<Roster | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const sb = supabase();
    const [f, c, k] = await Promise.all([
      sb.from("families").select("*").order("name"),
      sb.from("children").select("*").order("first_name"),
      sb.from("contacts").select("*").order("full_name"),
    ]);
    const err = f.error || c.error || k.error;
    if (err) return setError(err.message);
    setData({ families: f.data as Family[], children: c.data as Child[], contacts: k.data as Contact[] });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, reload };
}

export function useAttendance(date: string) {
  const [rows, setRows] = useState<Attendance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error } = await supabase().from("attendance").select("*").eq("care_date", date).order("check_in");
    if (error) setError(error.message);
    else setRows(data as Attendance[]);
  }, [date]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, error, reload };
}

/** Signed URL for a private pick-up photo (valid one hour). */
export async function photoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase().storage.from("pickup-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Shrinks a phone photo to at most 480px wide JPEG so storage stays tiny. */
export async function shrinkImage(file: File, max = 480): Promise<Blob> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.8));
}

/** All invoices and payments for the signed-in provider. */
export function useBilling() {
  const [data, setData] = useState<{ invoices: Invoice[]; payments: Payment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const sb = supabase();
    try {
      const [invoices, payments] = await Promise.all([
        fetchAll<Invoice>((a, b) => sb.from("invoices").select("*").order("issue_date", { ascending: false }).order("number", { ascending: false }).range(a, b)),
        fetchAll<Payment>((a, b) => sb.from("payments").select("*").order("paid_on", { ascending: false }).range(a, b)),
      ]);
      setData({ invoices, payments });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, reload };
}

/** Signed URL for a private receipt or document file (valid ten minutes). */
export async function fileUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase().storage.from("files").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

/** Uploads a receipt photo or document to the provider's private folder and returns its path. */
export async function uploadFile(uid: string, folder: string, file: File): Promise<string> {
  const isImage = file.type.startsWith("image/");
  const body = isImage ? await shrinkImage(file, 1400) : file;
  const ext = isImage ? "jpg" : (file.name.split(".").pop() || "pdf").toLowerCase();
  const path = `${uid}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage.from("files").upload(path, body, { contentType: isImage ? "image/jpeg" : file.type || "application/pdf" });
  if (error) throw new Error(error.message);
  return path;
}

/** Loads one table's rows for the provider, newest first by the given column. */
export function useRows<T>(table: string, order: string, ascending = false) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const { data, error } = await supabase().from(table).select("*").order(order, { ascending, nullsFirst: false });
    if (error) setError(error.message);
    else setRows(data as T[]);
  }, [table, order, ascending]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { rows, error, reload };
}

/** Reads every matching row, 1000 at a time (Supabase returns at most 1000 per request). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

/** Signed URLs for many photos at once (valid one hour). */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase().storage.from("photos").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

/** True when the provider's do-not-disturb hours cover the given time. */
export function inQuietHours(start?: string | null, end?: string | null, now = new Date()) {
  if (!start || !end) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = toMin(start);
  const e = toMin(end);
  return s <= e ? m >= s && m < e : m >= s || m < e;
}
