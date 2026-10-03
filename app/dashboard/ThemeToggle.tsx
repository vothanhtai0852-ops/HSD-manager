"use client";

import {
  useEffect,
  useState,
} from "react";

type ThemeMode =
  | "light"
  | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] =
    useState<ThemeMode>("light");

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          "hsd-theme"
        );

      const current:
        ThemeMode =
        saved === "dark"
          ? "dark"
          : "light";

      setTheme(current);

      document.documentElement.dataset.theme =
        current;
    } catch {
      document.documentElement.dataset.theme =
        "light";
    }
  }, []);

  function toggleTheme() {
    const next:
      ThemeMode =
      theme === "dark"
        ? "light"
        : "dark";

    setTheme(next);

    document.documentElement.dataset.theme =
      next;

    try {
      localStorage.setItem(
        "hsd-theme",
        next
      );
    } catch {
      // Không chặn UI nếu trình duyệt không cho dùng localStorage.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Đổi giao diện sáng tối"
      title="Đổi giao diện sáng tối"
      style={{
        minHeight: "38px",
        padding: "8px 12px",
        background: "#ffffff",
        color: "#171717",
        border:
          "1px solid rgba(255,255,255,0.75)",
        borderRadius: "8px",
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {theme === "dark"
        ? "☀ Sáng"
        : "☾ Tối"}
    </button>
  );
}
