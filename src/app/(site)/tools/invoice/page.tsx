import type { Metadata } from "next";
import ToolPage from "@/components/ToolPage";
import InvoiceForm from "@/components/InvoiceForm";

export const metadata: Metadata = {
  title: "Free daycare invoice template and generator",
  description:
    "Create a child care invoice for a week or month of care, with late fees, meals or registration. Free PDF for home daycare providers, no sign-up.",
  alternates: { canonical: "/tools/invoice" },
};

export default function Page() {
  return (
    <ToolPage
      title="Free daycare invoice generator"
      intro="Bill a family for a week or month of care, add extras like late pick-up fees, and download a PDF to send. Your details are remembered for next time."
      faqs={[
        {
          q: "How often should a home daycare invoice parents?",
          a: "Most home providers bill weekly or monthly, in advance. Pick one schedule, put it in your parent handbook, and invoice on the same day each time.",
        },
        {
          q: "Can I add a late pick-up fee?",
          a: "Yes. Tap \"Add a charge\" and enter the fee as its own line, like \"Late pick-up, 15 minutes\".",
        },
        {
          q: "Where do I put my Venmo or Zelle?",
          a: "Use the \"How to pay\" box. It prints at the bottom of the invoice so parents know exactly where to send money.",
        },
      ]}
    >
      <InvoiceForm />
    </ToolPage>
  );
}
