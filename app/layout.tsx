import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ritodo · Your everyday memory",
  description: "你的日程、课表与账本，交给一个会记住的助手。",
  applicationName: "Ritodo",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Ritodo", statusBarStyle: "black-translucent" },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icon-180.png",
  },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f2f2f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
