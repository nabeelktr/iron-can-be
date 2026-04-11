import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iron Can API",
  description: "Fitness tracker backend service",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
