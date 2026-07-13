import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "codebase-rag",
  description: "Ask a codebase questions in plain English — answers cite file:line.",
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
