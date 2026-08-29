import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import Backdrop from "@/components/Backdrop";
import PwaSetup from "@/components/PwaSetup";
import { MotionProvider } from "@/components/motion";
import { RTL_LOCALES } from "@/i18n/request";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <MotionProvider>
            <Backdrop />
            <PwaSetup />
            {children}
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
