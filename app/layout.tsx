import type {
  Metadata,
  Viewport,
} from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "KINGKONG MART - AUTO CHECK",
  description: "Hệ thống quản lý HSD và cảnh báo sản phẩm",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const themeBootScript = `
(function () {
  try {
    var saved = localStorage.getItem("hsd-theme");
    var theme = saved === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: themeBootScript,
          }}
        />
      </head>

      <body>{children}</body>
    </html>
  );
}
