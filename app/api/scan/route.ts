import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getScanActor } from "@/lib/scan";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getScanActor();
  if (auth.error) return auth.error;
  const { actor } = auth;
  let ownerIds = [actor.id];
  if (actor.role === "ADMIN") {
    const { data, error } = await supabaseServer.from("users").select("id").eq("active", true);
    if (error) return NextResponse.json({ error: "Không tải được tài khoản." }, { status: 500 });
    ownerIds = (data || []).map((row) => row.id);
  } else if (actor.role === "MANAGER") {
    const { data, error } = await supabaseServer.from("users").select("id")
      .eq("parent_id", actor.id).eq("role", "USER").eq("active", true);
    if (error) return NextResponse.json({ error: "Không tải được nhân viên." }, { status: 500 });
    ownerIds = [...ownerIds, ...(data || []).map((row) => row.id)];
  }
  const { data, error } = await supabaseServer.from("scan_sessions")
    .select("id, user_id, username_snapshot, status, created_at, completed_at")
    .in("user_id", ownerIds).order("created_at", { ascending: false }).limit(100);
  if (error) {
    console.error("SCAN_LIST_ERROR", error);
    return NextResponse.json({ error: "Không tải được lịch sử kiểm hàng." }, { status: 500 });
  }
  return NextResponse.json({ sessions: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const auth = await getScanActor();
  if (auth.error) return auth.error;
  const { actor } = auth;
  const { data, error } = await supabaseServer.from("scan_sessions").insert({
  user_id: actor.id,
  username: actor.username,
  username_snapshot: actor.username,
  status: "ACTIVE",
}).select("id, user_id, username_snapshot, status, created_at, completed_at").single();
  if (error) {
    console.error("SCAN_CREATE_ERROR", error);
    return NextResponse.json({ error: "Không tạo được phiên kiểm hàng." }, { status: 500 });
  }
  return NextResponse.json({ session: data }, { status: 201 });
}
