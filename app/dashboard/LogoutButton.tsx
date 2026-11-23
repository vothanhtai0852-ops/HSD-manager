"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      router.replace("/login");
    } catch (error) {
      console.error("LOGOUT_ERROR:", error);
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      title="Đăng xuất"
      onClick={handleLogout}
      disabled={loading}
    >
      {loading ? "Đang đăng xuất..." : "Đăng xuất"}
    </button>
  );
}
