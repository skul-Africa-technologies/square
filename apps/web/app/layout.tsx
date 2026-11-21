import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Square",
  description: "Discord for campus builders, where doing things is rewarded and visible",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ height: "100dvh", overflow: "hidden" }}>
      <body className="bg-bg text-text" style={{ height: "100dvh", overflow: "hidden" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
