import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shared Todo",
  description: "Samen waar gewenst. Privé waar nodig.",
  manifest: "/manifest.webmanifest"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl-NL">
      <body>{children}</body>
    </html>
  );
}
