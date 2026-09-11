import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { PricesProvider } from "@/context/prices";
import { StoreProvider } from "@/context/store";
import { isGateEnabled } from "@/lib/app-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Resonance — Phase Zero",
  description:
    "Personal operating dashboard for Andres López. Track treasury, nodes, decisions, and rewards. Human-governed. No keys.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <StoreProvider>
          <PricesProvider>
            <AppShell gateEnabled={isGateEnabled()}>{children}</AppShell>
          </PricesProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
