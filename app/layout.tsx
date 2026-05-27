import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manas — Consultation Scribe",
  description:
    "AI-assisted psychiatric consultation report generator — transcribe, summarize, and manage clinical documentation effortlessly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
