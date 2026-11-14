"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Attendance, Child, Contact, Family } from "./types";

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
