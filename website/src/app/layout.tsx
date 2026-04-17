import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Umbrella — Sovereign Agentic OS",
  description:
    "Command Bento showcase: swarm DAG, self-healing runner, risk governance, DR health — the Umbrella workstation.",
  metadataBase: new URL("https://umbrellagnt.xyz"),
  openGraph: {
    title: "Umbrella — Sovereign Agentic OS",
    description: "Live terminal, bento dashboard, and hardened agentic workstation patterns.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
