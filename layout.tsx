import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHÁT EM — Tạo QR chuyển khoản",
  description: "Tạo mã QR chuyển khoản VietQR theo mẫu, quản lý lượt sử dụng.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
