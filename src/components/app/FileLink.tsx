"use client";

import { fileUrl } from "@/lib/app/data";

/** Opens a private receipt or document in a new tab using a short-lived link. */
export default function FileLink({ path, label = "View" }: { path: string | null; label?: string }) {
  if (!path) return null;
  return (
    <button
      type="button"
      className="text-sm font-bold text-peach-dark"
      onClick={async (e) => {
        e.stopPropagation();
        const w = window.open("", "_blank");
        const url = await fileUrl(path);
        if (url && w) w.location.href = url;
        else w?.close();
      }}
    >
      {label}
    </button>
  );
}
