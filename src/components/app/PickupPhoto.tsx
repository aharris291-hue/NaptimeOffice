"use client";

import { useEffect, useState } from "react";
import { photoUrl } from "@/lib/app/data";

export default function PickupPhoto({ path, name, size = 56 }: { path: string | null; name: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    photoUrl(path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path]);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} width={size} height={size} className="shrink-0 rounded-2xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-2xl bg-sage-soft font-bold text-sage" style={{ width: size, height: size }}>
      {initials || "?"}
    </span>
  );
}
