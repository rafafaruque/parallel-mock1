import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Company Research Explorer",
  description: "A source-backed company brief for your next meeting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
