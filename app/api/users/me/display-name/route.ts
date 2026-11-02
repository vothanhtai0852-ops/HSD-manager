import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";

export async function PATCH(request: Request) {
  try {
    const token = (await cookies()).get("hsd_session")?.value;
    if (!token) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
    const session = await verifySessionToken(token);
    if (!session) return NextResponse.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

    const body = await request.json();
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName || displayName.length > 100) {
      return NextResponse.json({ error: "Tên hiển thị phải có từ 1 đến 100 ký tự." }, { status: 400 });
    }

    const { data: currentUser, error: lookupError } = await supabaseServer
      .from("users").select("id, active").eq("id", session.userId).maybeSingle();
    if (lookupError) throw lookupError;
    if (!currentUser?.active) return NextResponse.json({ error: "Tài khoản không hợp lệ." }, { status: 401 });

    // Không cập nhật username, password, email hay quyền của người dùng.
    const { data, error } = await supabaseServer
      .from("users")
      .update({ display_name: displayName, updated_at: new Date().toISOString() })
      .eq("id", currentUser.id)
      .select("display_name")
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, message: "Đã cập nhật tên hiển thị.", displayName: data.display_name });
  } catch (error) {
    console.error("UPDATE_DISPLAY_NAME_ERROR:", error);
    return NextResponse.json({ error: "Không thể cập nhật tên hiển thị." }, { status: 500 });
  }
}
