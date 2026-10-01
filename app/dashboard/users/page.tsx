import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

import UserManagement from "../UserManagement";


export default async function UsersPage() {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      "hsd_session"
    )?.value;


  if (!token) {
    redirect("/login");
  }


  const session =
    await verifySessionToken(
      token
    );


  if (!session) {
    redirect("/login");
  }


  const {
    data: user,
    error,
  } = await supabaseServer
    .from("users")
    .select(
      `
        id,
        username,
        role,
        active,
        display_name
      `
    )
    .eq(
      "id",
      session.userId
    )
    .maybeSingle();


  if (
    error ||
    !user ||
    !user.active
  ) {
    redirect("/login");
  }


  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }


  return (
    <main className="kk-page">
      <header
        style={{
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                margin:
                  "0 0 4px",
              }}
            >
              Quản lý tài khoản
            </h1>

            <p
              style={{
                margin: 0,
                color:
                  "var(--text-secondary)",
              }}
            >
              Quản lý nhân viên,
              quyền truy cập,
              Gmail nhận cảnh báo
              và mật khẩu.
            </p>
          </div>


          <Link
            href="/dashboard"
            style={{
              display:
                "inline-flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              minHeight:
                "40px",

              padding:
                "8px 16px",

              border:
                "1px solid var(--border-strong)",

              borderRadius:
                "8px",

              background:
                "#ffffff",

              color:
                "var(--foreground)",

              fontWeight:
                800,

              textDecoration:
                "none",
            }}
          >
            ← Quay lại Dashboard
          </Link>
        </div>
      </header>


      <UserManagement />
    </main>
  );
}