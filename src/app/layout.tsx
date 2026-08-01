import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PodHQ",
  description: "MyFitPod franchise analytics",
  applicationName: "PodHQ",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

// CSP uses a fresh per-request nonce (see proxy.ts), which only exists at
// request time — a statically prerendered page has no request to draw one
// from, so every route must render dynamically for the nonce embedded in
// Next's own inline hydration scripts to match the nonce in that response's
// CSP header. Without this, those inline scripts get silently blocked by
// CSP and the page never hydrates (confirmed root cause of a login page
// that looked fine but had zero interactivity — see proxy.ts).
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full antialiased dark`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
