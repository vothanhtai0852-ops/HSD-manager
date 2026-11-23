import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

import ProductsTable from "./ProductsTable";
import AddProductForm from "./AddProductForm";
import ModuleMenu from "./ModuleMenu";

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

  return (
    <main className="kk-page">
      <header className="dashboard-module-header dashboard-main-header" style={{ marginBottom: "20px", padding: "16px 18px", borderRadius: "14px", background: "linear-gradient(90deg, var(--kk-red) 0%, var(--kk-red-dark) 100%)", boxShadow: "var(--shadow-md)" }}>
        <div style={{ width: "100%", display: "flex", alignItems: "center", minHeight: "62px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap" }}>
              <strong style={{ color: "var(--kk-yellow)", fontSize: "24px", fontWeight: 900 }}>KINGKONG MART</strong>
              <strong style={{ color: "#fff", fontSize: "21px", fontWeight: 900, letterSpacing: "0.05em" }}>AUTO CHECK</strong>
            </div>
            <div style={{ marginTop: "5px", color: "rgba(255,255,255,0.95)", fontSize: "15px", fontWeight: 700 }}>Kiểm soát hạn sử dụng sản phẩm</div>
          </div>
        </div>
        <ModuleMenu username={user.username} role={user.role} currentDisplayName={user.display_name ?? ""} />
      </header>

      <AddProductForm />

      <ProductsTable />
    </main>
  );
}
