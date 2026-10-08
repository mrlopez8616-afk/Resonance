import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Inter } from "next/font/google";
import { headers } from "next/headers";
import { PATH_HEADER, isLoginPage } from "@/lib/auth-core";
import { requireSession } from "@/lib/auth-session";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resonance 2.0",
  description:
    "Operator floor. Live XRP node. Vault locked. Gas wallet hidden.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get(PATH_HEADER) ?? "";
  if (!isLoginPage(path)) await requireSession();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
