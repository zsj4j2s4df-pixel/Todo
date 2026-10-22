import type { Metadata } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export const metadata: Metadata = {
  title: "Shared Todo",
  description: "Samen waar gewenst. Privé waar nodig.",
  manifest: "/manifest.webmanifest",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl-NL">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
