import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UW Blueprint — Reimbursements",
  description: "Student reimbursement submission portal for UW Blueprint",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
