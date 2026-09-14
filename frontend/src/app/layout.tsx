import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});
const jbMono = JetBrains_Mono({ variable: "--font-jbmono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "AI Logistics Autopilot — Command every kilometre",
    template: "%s · AI Logistics Autopilot",
  },
  description:
    "An AI-powered logistics command center that automates shipment assignment, route optimization, delay triage, disruption response and fleet utilization — built for Smart India Hackathon 2026.",
  keywords: ["logistics", "AI", "fleet management", "route optimization", "supply chain", "Smart India Hackathon"],
  openGraph: {
    title: "AI Logistics Autopilot",
    description: "The AI command center for freight operations. Every dispatch, route and risk — on one pane of glass.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#f6f4ef",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${instrumentSerif.variable} ${jbMono.variable} antialiased bg-background text-foreground font-sans`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
