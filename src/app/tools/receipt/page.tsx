import type { Metadata } from "next";
import ToolPage from "@/components/ToolPage";
import ReceiptForm from "@/components/ReceiptForm";

export const metadata: Metadata = {
  title: "Free daycare receipt generator",
  description:
    "Make a professional child care payment receipt in seconds. Cash, check, Venmo or Zelle. Free PDF to text or email to parents, no sign-up.",
  alternates: { canonical: "/tools/receipt" },
};

export default function Page() {
  return (
    <ToolPage
      title="Free daycare receipt generator"
      intro="Give parents a clean receipt for any payment: cash, check, Venmo, Zelle or anything else. Download the PDF and text or email it."
      faqs={[
        {
          q: "Do I need to give daycare parents receipts?",
          a: "It's good practice, and parents often need them for their FSA or employer childcare benefits. Receipts also protect you if there's ever a question about what was paid.",
        },
        {
          q: "What should a child care receipt include?",
          a: "Your name and address, who paid, the date, the amount, how they paid and what it was for. This tool includes all of it.",
        },
        {
          q: "Is my information saved?",
          a: "Your own details are remembered in this browser so you don't retype them. Nothing is uploaded to a server.",
        },
      ]}
    >
      <ReceiptForm />
    </ToolPage>
  );
}
