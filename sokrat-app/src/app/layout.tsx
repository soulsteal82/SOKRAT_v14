import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./lib/auth-context";

export const metadata: Metadata = {
  title: "SOKRAT",
  description: "Smart Operations & Kinetic Real-Time Asset Twin",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SOKRAT",
  },
};

export const viewport = {
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
            <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}