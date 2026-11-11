import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";
import ScanBarcodeClient from "./ScanBarcodeClient";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const jar = await cookies();
  const token = jar.get("hsd_session")?.value;
  if (!token) redirect("/login");
  const session = await verifySessionToken(token);
  if (!session) redirect("/login");
  const { data: user, error } = await supabaseServer.from("users")
    .select("id, username, role, active, display_name")
    .eq("id", session.userId).maybeSingle();
  if (error || !user || !user.active) redirect("/login");
  return <main className="kk-page scan-page"><ScanBarcodeClient username={user.display_name || user.username} userId={user.id} /></main>;
}
