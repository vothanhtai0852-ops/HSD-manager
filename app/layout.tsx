import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KINGKONG MART - AUTO CHECK",
  description: "Hệ thống quản lý HSD và cảnh báo sản phẩm",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}