import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

import UserManagement from "./UserManagement";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hsd_session")?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await verifySessionToken(token);

  if (!session) {
    redirect("/login");
  }

  const { data: user, error } = await supabaseServer
    .from("users")
    .select(
      `
        id,
        username,
        display_name,
        role,
        active
      `
    )
    .eq("id", session.userId)
    .maybeSingle();

  if (error || !user || !user.active) {
    redirect("/login");
  }

  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    redirect("/dashboard");
  }

  const isManager = user.role === "MANAGER";

  return (
    <main className="kk-page">
      <header
        style={{
          marginBottom: "18px",
          padding: "16px 18px",
          borderRadius: "14px",
          background:
            "linear-gradient(90deg, var(--kk-red) 0%, var(--kk-red-dark) 100%)",
          color: "#ffffff",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: "var(--kk-yellow)",
                fontWeight: 900,
                fontSize: "22px",
              }}
            >
              KINGKONG MART
            </div>

            <h1
              style={{
                margin: "4px 0 0",
                fontSize: "21px",
              }}
            >
              {isManager ? "Quản lý nhân viên" : "Quản lý tài khoản"}
            </h1>

            <div
              style={{
                marginTop: "4px",
                color: "rgba(255,255,255,0.82)",
                fontSize: "12px",
                overflowWrap: "anywhere",
              }}
            >
              {user.display_name || user.username}
              {" · "}
              {user.role}
            </div>
          </div>

          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              minHeight: "40px",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px 14px",
              borderRadius: "8px",
              background: "#ffffff",
              color: "var(--kk-red)",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            ← Quay lại Dashboard
          </Link>
        </div>
      </header>

      <div
        style={{
          marginBottom: "16px",
          color: "var(--text-secondary)",
        }}
      >
        {isManager
          ? "Chọn USER có sẵn để thêm hoặc gỡ khỏi phạm vi quản lý của bạn."
          : "Quản lý nhân viên, quyền truy cập, Gmail nhận cảnh báo và mật khẩu."}
      </div>

      <UserManagement />
    </main>
  );
}
