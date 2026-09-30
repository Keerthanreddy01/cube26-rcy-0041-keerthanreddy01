import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RECOVER — Recovery Manager | CUBE 2026",
  description: "Evidence-driven recovery decisions for ecommerce operations.",
  keywords: "recovery manager, commerce, claims, evidence, reimbursement, CUBE 2026",
  icons: {
    icon: '/brand/logo.png',
    shortcut: '/favicon.ico',
    apple: '/brand/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/brand/logo.png" type="image/png" />
        <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
        <link rel="apple-touch-icon" href="/brand/logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Inter', sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
