import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fessup — Understand what your AI coder just did",
  description:
    "Plain-English change receipts for AI-built software. Know what changed, what you can do now, and how to test it — even if you can't read code.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
