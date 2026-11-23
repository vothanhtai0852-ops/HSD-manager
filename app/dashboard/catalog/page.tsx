import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

import CatalogImportClient from "./CatalogImportClient";
import ModuleMenu from "../ModuleMenu";

export default async function CatalogPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("hsd_session")?.value;

  if (!token) {
    redirect("/login");
  }

  const session = await verifySessionToken(token);

  if (!session) {
    redirect("/login");
  }

  const [userResult, countResult] = await Promise.all([
    supabaseServer
      .from("users")
      .select("id, username, display_name, role, active")
      .eq("id", session.userId)
      .maybeSingle(),
    supabaseServer
      .from("product_catalog")
      .select("id", { count: "exact", head: true }),
  ]);

  const { data: user, error: userError } = userResult;

  if (userError || !user || !user.active) {
    redirect("/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const { count, error: countError } = countResult;

  if (countError) {
    console.error(
      "CATALOG_PAGE_COUNT_ERROR:",
      countError
    );
  }

  return (
    <main className="kk-page">
      <header
        className="dashboard-module-header"
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
          <div>
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
              Cập nhật DATA sản phẩm
            </h1>

            <div
              style={{
                marginTop: "4px",
                color: "rgba(255,255,255,0.82)",
                fontSize: "12px",
              }}
            >
              {user.display_name || user.username}
              {" · ADMIN"}
            </div>
          </div>
        </div>
        <ModuleMenu
          username={user.username}
          role={user.role}
          currentDisplayName={user.display_name ?? ""}
        />
      </header>

      <CatalogImportClient
        initialCatalogCount={count ?? 0}
      />
    </main>
  );
}
