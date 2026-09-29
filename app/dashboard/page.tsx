import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";
import LogoutButton from "./LogoutButton";
import ProductsTable from "./ProductsTable";
import AddProductForm from "./AddProductForm";
import UserManagement from "./UserManagement";

export default async function DashboardPage() {
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
    .select("id, username, role, active, display_name")
    .eq("id", session.userId)
    .maybeSingle();

  if (error || !user || !user.active) {
    redirect("/login");
  }

 return (
  <main>
    <h1>HSD Manager Dashboard</h1>

    <p>
      Xin chào: <strong>{user.display_name || user.username}</strong>
    </p>

    <p>
      Tài khoản: <strong>{user.username}</strong>
    </p>

    <p>
      Quyền: <strong>{user.role}</strong>
    </p>

    <LogoutButton />

    <AddProductForm />

    <UserManagement />

    <ProductsTable />
  </main>
);
}