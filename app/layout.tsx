import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BucksBuddy",
  description: "What's up, Doc? Your dead-simple money tracker.",
  applicationName: "BucksBuddy",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "BucksBuddy",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
    icon: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-surface text-label antialiased">
        {children}
      </body>
    </html>
  );
}
