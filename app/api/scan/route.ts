import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getScanActor, getScanTokenActor } from "@/lib/scan";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getScanTokenActor();
  if (auth.error) return auth.error;
  const { actor } = auth;

  // Validate the latest account state while resolving the manager/admin scope
  // in parallel. The previous version did these reads one after another.
  const currentUserQuery = supabaseServer
    .from("users")
    .select("id, role, active")
    .eq("id", actor.id)
    .maybeSingle();

  const scopeUsersQuery = actor.role === "ADMIN"
    ? supabaseServer.from("users").select("id").eq("active", true)
    : actor.role === "MANAGER"
      ? supabaseServer.from("users").select("id")
          .eq("parent_id", actor.id).eq("role", "USER").eq("active", true)
      : null;

  const [currentUserResult, scopeUsersResult] = await Promise.all([
    currentUserQuery,
    scopeUsersQuery ?? Promise.resolve({ data: [], error: null }),
  ]);

  if (currentUserResult.error) {
    console.error("SCAN_CURRENT_USER_ERROR", currentUserResult.error);
    return NextResponse.json({ error: "Không thể xác minh tài khoản." }, { status: 500 });
  }
  if (!currentUserResult.data?.active) {
    return NextResponse.json({ error: "Tài khoản không hoạt động." }, { status: 401 });
  }
  if (currentUserResult.data.role !== actor.role) {
    return NextResponse.json({ error: "Quyền tài khoản đã thay đổi. Hãy đăng nhập lại." }, { status: 401 });
  }
  if (scopeUsersResult.error) {
    console.error("SCAN_SCOPE_USERS_ERROR", scopeUsersResult.error);
    return NextResponse.json(
      { error: actor.role === "ADMIN" ? "Không tải được tài khoản." : "Không tải được nhân viên." },
      { status: 500 }
    );
  }

  let ownerIds = [actor.id];
  if (actor.role === "ADMIN") {
    ownerIds = (scopeUsersResult.data || []).map((row) => row.id);
  } else if (actor.role === "MANAGER") {
    ownerIds = [...ownerIds, ...(scopeUsersResult.data || []).map((row) => row.id)];
  }

  const { data, error } = await supabaseServer.from("scan_sessions")
    .select("id, user_id, username_snapshot, status, created_at, completed_at")
    .in("user_id", ownerIds).order("created_at", { ascending: false }).limit(100);

  if (error) {
    console.error("SCAN_LIST_ERROR", error);
    return NextResponse.json({ error: "Không tải được lịch sử kiểm hàng." }, { status: 500 });
  }

  return NextResponse.json(
    { sessions: data || [] },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST() {
  const auth = await getScanActor();
  if (auth.error) return auth.error;
  const { actor } = auth;
  const { data, error } = await supabaseServer.from("scan_sessions").insert({
  user_id: actor.id,
  username: actor.username,
  username_snapshot: actor.username,
  status: "DRAFT",
}).select("id, user_id, username_snapshot, status, created_at, completed_at").single();
  if (error) {
    console.error("SCAN_CREATE_ERROR", error);
    return NextResponse.json({ error: "Không tạo được phiên kiểm hàng." }, { status: 500 });
  }
  return NextResponse.json({ session: data }, { status: 201 });
}
