import type { Metadata } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import { RainOverlay } from "@/components/RainOverlay";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Umbrella — Sovereign Agentic OS",
  description:
    "Ink-and-code workstation: live runner, shadow DAG, policy gates, DR — the Umbrella agent in the rain.",
  metadataBase: new URL("https://umbrellagnt.xyz"),
  openGraph: {
    title: "Umbrella — Sovereign Agentic OS",
    description:
      "Live terminal, bento dashboard, policy-gated autonomy, DR snapshots. Ink aesthetic.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${caveat.variable}`}
    >
      <body className="font-sans text-crisp">
        <RainOverlay />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
