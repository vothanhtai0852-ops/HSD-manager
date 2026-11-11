import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getScanActor, getScanSession, isUuid } from "@/lib/scan";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const auth = await getScanActor();
  if (auth.error) return auth.error;
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) return NextResponse.json({ error: "Mã phiên không hợp lệ." }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const productCode = typeof body.productCode === "string" ? body.productCode.trim() : "";
  if (!productCode || productCode.length > 128) return NextResponse.json({ error: "Mã sản phẩm không hợp lệ." }, { status: 400 });

  try {
    const access = await getScanSession(auth.actor, sessionId);
    if (access.forbidden) return NextResponse.json({ error: "Không có quyền sửa phiên này." }, { status: 403 });
    if (!access.session) return NextResponse.json({ error: "Không tìm thấy phiên." }, { status: 404 });
    if (access.session.user_id !== auth.actor.id) return NextResponse.json({ error: "Chỉ người tạo phiên mới được quét." }, { status: 403 });
    if (access.session.status !== "DRAFT") return NextResponse.json({ error: "Phiên đã lưu, không thể thêm mã." }, { status: 409 });

    const { data, error } = await supabaseServer.rpc("scan_increment_item", {
      p_session_id: sessionId, p_actor_user_id: auth.actor.id, p_product_code: productCode,
    });
    if (error) {
      if (error.message.includes("PRODUCT_NOT_FOUND")) return NextResponse.json({ error: "Không tìm thấy mã này trong DATA." }, { status: 404 });
      if (error.message.includes("SESSION_NOT_ACTIVE")) return NextResponse.json({ error: "Phiên đã lưu, không thể thêm mã." }, { status: 409 });
      console.error("SCAN_INCREMENT_ERROR", error);
      return NextResponse.json({ error: "Không thể cập nhật số lượng." }, { status: 500 });
    }
    return NextResponse.json({ item: Array.isArray(data) ? data[0] : data });
  } catch (error) {
    console.error("SCAN_INCREMENT_UNEXPECTED", error);
    return NextResponse.json({ error: "Không thể quét mã sản phẩm." }, { status: 500 });
  }
}
