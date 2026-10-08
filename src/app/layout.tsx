import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "material-symbols/outlined.css";
import "./globals.css";
import { getAuthUser, DEFAULT_THEME } from "@/lib/auth";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "DistributeIQ - FMCG distribution",
  description: "Orders, products, payments and teams for FMCG distribution agencies.",
};

/** "#rrggbb" -> [r, g, b], falling back to the default accent. */
function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex) ?? /^#?([0-9a-f]{6})$/i.exec(DEFAULT_THEME)!;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const mix = (c: number[], target: number, amount: number) => c.map(v => Math.round(v * (1 - amount) + target * amount));

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getAuthUser();
  const accent = parseHex(user?.themeColor || DEFAULT_THEME);
  // Agency accent for light mode: the colour itself, a pale tint for fills, a dark shade for text on the tint.
  const agencyVars = {
    "--agency-primary": accent.join(" "),
    "--agency-primary-container": mix(accent, 255, 0.88).join(" "),
    "--agency-on-primary-container": mix(accent, 0, 0.4).join(" "),
  } as React.CSSProperties;

  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body style={agencyVars}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
