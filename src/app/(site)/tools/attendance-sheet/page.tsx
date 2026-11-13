import type { Metadata } from "next";
import ToolPage from "@/components/ToolPage";
import SheetForm from "@/components/SheetForm";

export const metadata: Metadata = {
  title: "Free printable daycare sign-in and sign-out sheet",
  description:
    "Print a daily child care sign-in/sign-out sheet with times and parent signatures for each day of the week. Free PDF for home daycare providers.",
  alternates: { canonical: "/tools/attendance-sheet" },
};

export default function Page() {
  return (
    <ToolPage
      title="Free printable daycare sign-in sheet"
      intro="Print a sign-in and sign-out sheet for each day of the week, with each child's name already filled in. Columns for time in, time out and both parent signatures."
      faqs={[
        {
          q: "Do home daycares need sign-in sheets?",
          a: "Most licensing agencies require a daily attendance record with arrival and departure times, and many require a parent signature. Check your own state or local rules for exactly what to record and how long to keep it.",
        },
        {
          q: "How long should I keep attendance records?",
          a: "Rules vary by location, but keeping them for at least a few years is common. A digital record is much easier to store and search than paper.",
        },
      ]}
    >
      <SheetForm />
    </ToolPage>
  );
}
