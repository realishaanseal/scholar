import type { Metadata, Viewport } from "next";
import Backdrop from "@/components/Backdrop";
import PwaSetup from "@/components/PwaSetup";
import "./globals.css";

export const metadata: Metadata = {
  title: "Varaxis Scholar — AI homework organiser",
  description:
    "Capture homework by voice or text, let AI clean it up, categorise it by subject, and keep deadlines from sneaking up on you. A Varaxis product.",
  manifest: "/manifest.webmanifest",
  applicationName: "Varaxis Scholar",
  appleWebApp: {
    capable: true,
    title: "Scholar",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#05060b",
  width: "device-width",
  initialScale: 1,
  // Capture is the main mobile action and it's a text field; blocking zoom
  // entirely would fail accessibility, so scaling is allowed but bounded.
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Backdrop />
        <PwaSetup />
        {children}
      </body>
    </html>
  );
}
