import type { Metadata } from "next";

export const metadata: Metadata = { title: "Parent", robots: { index: false } };

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen w-full max-w-2xl px-4 pb-16">{children}</div>;
}
