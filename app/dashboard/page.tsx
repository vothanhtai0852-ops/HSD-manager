import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

import LogoutButton from "./LogoutButton";
import ProductsTable from "./ProductsTable";
import AddProductForm from "./AddProductForm";
import ThemeToggle from "./ThemeToggle";
import RenameUsernameButton from "./RenameUsernameButton";

export default async function DashboardPage() {
  const cookieStore = await cookies();
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

  const canManageUsers =
    user.role === "ADMIN" ||
    user.role === "MANAGER";

  const isAdmin =
    user.role === "ADMIN";

  return (
    <main className="kk-page">
      <header
        style={{
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "18px",
            padding: "16px 18px",
            background:
              "linear-gradient(90deg, var(--kk-red) 0%, var(--kk-red-dark) 100%)",
            borderRadius: "14px",
            boxShadow:
              "var(--shadow-md)",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              minWidth: 0,
              flex: "1 1 520px",
            }}
          >
            <div
              style={{
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems:
                    "baseline",
                  gap: "14px",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    color:
                      "var(--kk-yellow)",
                    fontSize: "24px",
                    fontWeight: 900,
                    letterSpacing:
                      "0.02em",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  KINGKONG MART
                </div>

                <div
                  style={{
                    color: "#ffffff",
                    fontSize: "21px",
                    fontWeight: 900,
                    letterSpacing:
                      "0.05em",
                    whiteSpace:
                      "nowrap",
                  }}
                >
                  AUTO CHECK
                </div>
              </div>

              <div
                style={{
                  marginTop: "5px",
                  color:
                    "rgba(255,255,255,0.95)",
                  fontSize: "15px",
                  fontWeight: 700,
                  lineHeight: 1.35,
                }}
              >
                Luôn đảm bảo HSD sản phẩm được kiểm soát
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent:
                "flex-end",
              gap: "8px",
              flexWrap: "wrap",
              flex: "0 1 auto",
            }}
          >
            {canManageUsers && (
              <Link
                href="/dashboard/users"
                style={{
                  display:
                    "inline-flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  minHeight: "38px",
                  padding:
                    "8px 12px",
                  borderRadius: "8px",
                  background:
                    "#ffffff",
                  color:
                    "var(--kk-red)",
                  fontWeight: 800,
                  textDecoration:
                    "none",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {user.role ===
                "MANAGER"
                  ? "Nhân viên"
                  : "Tài khoản"}
              </Link>
            )}

            {isAdmin && (
              <Link
                href="/dashboard/catalog"
                style={{
                  display:
                    "inline-flex",
                  alignItems:
                    "center",
                  justifyContent:
                    "center",
                  minHeight: "38px",
                  padding:
                    "8px 12px",
                  borderRadius: "8px",
                  background:
                    "#ffffff",
                  color:
                    "var(--kk-red)",
                  fontWeight: 800,
                  textDecoration:
                    "none",
                  whiteSpace:
                    "nowrap",
                }}
              >
                DATA
              </Link>
            )}

            <RenameUsernameButton
              currentUsername={
                user.username
              }
            />

            <ThemeToggle />

            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: "12px",
                paddingLeft:
                  "14px",
                marginLeft: "4px",
                borderLeft:
                  "1px solid rgba(255,255,255,0.22)",
              }}
            >
              <div
                style={{
                  textAlign: "right",
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    color:
                      "rgba(255,255,255,0.78)",
                    fontSize: "11px",
                    marginBottom:
                      "2px",
                  }}
                >
                  Đang đăng nhập
                </div>

                <div
                  style={{
                    color:
                      "#ffffff",
                    fontWeight: 800,
                    fontSize: "15px",
                  }}
                >
                  {user.display_name ||
                    user.username}
                </div>

                <div
                  style={{
                    color:
                      "rgba(255,255,255,0.82)",
                    fontSize: "12px",
                  }}
                >
                  {user.username}
                  {" · "}
                  {user.role}
                </div>
              </div>

              <div
                style={{
                  flexShrink: 0,
                }}
              >
                <LogoutButton />
              </div>
            </div>
          </div>
        </div>
      </header>

      <AddProductForm />

      <ProductsTable />
    </main>
  );
}
