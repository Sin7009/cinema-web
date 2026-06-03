import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sinflex — Онлайн-кинотеатр",
  description: "Удобный онлайн-просмотр фильмов и сериалов из вашей медиатеки через TorrServer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#07060f]">{children}</body>
    </html>
  );
}
