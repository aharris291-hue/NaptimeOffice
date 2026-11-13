import type { Metadata } from "next";
import AuthGate from "@/components/app/AuthGate";

export const metadata: Metadata = { title: "App", robots: { index: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
