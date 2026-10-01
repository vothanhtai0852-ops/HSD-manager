import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

import LogoutButton from "./LogoutButton";
import ProductsTable from "./ProductsTable";
import AddProductForm from "./AddProductForm";
import Link from "next/link";


export default async function DashboardPage() {
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


  return (
    <main className="kk-page">
      {/* =================================================
          HEADER
      ================================================== */}

      <header
        style={{
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "flex",

            alignItems: "stretch",

            justifyContent:
              "space-between",

            flexWrap: "wrap",

            gap: "12px",
          }}
        >
          {/* BRAND */}

          <div
            style={{
              display: "flex",

              alignItems:
                "stretch",

              flexWrap:
                "wrap",

              borderRadius:
                "14px",

              overflow:
                "hidden",

              boxShadow:
                "var(--shadow-md)",
            }}
          >
            {/* KINGKONG MART */}

            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                padding:
                  "14px 20px",

                background:
                  "var(--kk-red)",

                color:
                  "var(--kk-yellow)",

                fontSize:
                  "22px",

                fontWeight:
                  900,

                letterSpacing:
                  "0.02em",
              }}
            >
              KINGKONG MART
            </div>


            {/* AUTO CHECK */}

            <div
              style={{
                display:
                  "flex",

                alignItems:
                  "center",

                padding:
                  "14px 20px",

                background:
                  "#ffffff",

                color:
                  "#171717",

                borderTop:
                  "1px solid var(--border)",

                borderRight:
                  "1px solid var(--border)",

                borderBottom:
                  "1px solid var(--border)",

                fontSize:
                  "20px",

                fontWeight:
                  900,

                letterSpacing:
                  "0.04em",
              }}
            >
              AUTO CHECK
            </div>
          </div>


          {/* USER / LOGOUT */}

          <div
            className="kk-card"
            style={{
              display:
                "flex",

              alignItems:
                "center",

              gap:
                "16px",

              padding:
                "10px 14px",

              flexWrap:
                "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize:
                    "12px",

                  color:
                    "var(--text-secondary)",

                  marginBottom:
                    "2px",
                }}
              >
                Đang đăng nhập
              </div>


              <div
                style={{
                  fontWeight:
                    800,
                }}
              >
                {user.display_name ||
                  user.username}
              </div>


              <div
                style={{
                  fontSize:
                    "12px",

                  color:
                    "var(--text-secondary)",
                }}
              >
                {user.username}
                {" · "}
                {user.role}
              </div>
            </div>


            <LogoutButton />
          </div>
        </div>


        {/* SUBTITLE */}

        <div
          style={{
            marginTop:
              "14px",

            padding:
              "0 4px",
          }}
        >
          <h1
            style={{
              margin:
                "0 0 4px",

              fontSize:
                "24px",
            }}
          >
            Luôn đảm bảo HSD sản phẩm được kiểm soát
          </h1>


          <p
            style={{
              margin: 0,

              color:
                "var(--text-secondary)",
            }}
          >
            Theo dõi hạn sử dụng,
            ngày báo lại và cảnh báo
            sản phẩm tập trung.
          </p>
        </div>
      </header>


      {/* =================================================
          CONTENT
      ================================================== */}

      <AddProductForm />

      {user.role === "ADMIN" && (
  <section>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2
          style={{
            margin: "0 0 4px",
          }}
        >
          Quản lý tài khoản
        </h2>

        <p
          style={{
            margin: 0,
            color: "var(--text-secondary)",
          }}
        >
          Quản lý nhân viên, quyền truy cập,
          Gmail nhận cảnh báo và mật khẩu.
        </p>
      </div>

      <Link
        href="/dashboard/users"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",

          minHeight: "40px",

          padding: "8px 16px",

          borderRadius: "8px",

          background: "var(--kk-red)",
          color: "#ffffff",

          fontWeight: 800,

          textDecoration: "none",
        }}
      >
        Quản lý tài khoản
      </Link>
    </div>
  </section>
)}

      <ProductsTable />
    </main>
  );
}