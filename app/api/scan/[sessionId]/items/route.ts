
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getScanTokenActor, isUuid } from "@/lib/scan";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const auth = await getScanTokenActor();
  if (auth.error) return auth.error;

  const { sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return NextResponse.json(
      { error: "Mã phiên không hợp lệ." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));

  const productCode =
    typeof body.productCode === "string" ? body.productCode.trim() : "";

  const locationNote =
    typeof body.locationNote === "string" ? body.locationNote.trim() : "";

  if (!productCode || productCode.length > 128) {
    return NextResponse.json(
      { error: "Mã sản phẩm không hợp lệ." },
      { status: 400 }
    );
  }

  if (locationNote.length > 500) {
    return NextResponse.json(
      { error: "Ghi chú vị trí tối đa 500 ký tự." },
      { status: 400 }
    );
  }

  try {
    // Ownership, active-user and active-session checks are performed atomically
    // inside scan_increment_item, avoiding separate SELECT requests here.
    const { data, error } = await supabaseServer.rpc(
      "scan_increment_item",
      {
        p_session_id: sessionId,
        p_actor_user_id: auth.actor.id,
        p_product_code: productCode,
        p_location_note: locationNote,
      }
    );

    if (error) {
      if (error.message.includes("PRODUCT_NOT_FOUND")) {
        return NextResponse.json(
          { error: "Không tìm thấy mã này trong DATA." },
          { status: 404 }
        );
      }

      if (error.message.includes("SESSION_NOT_ACTIVE")) {
        return NextResponse.json(
          { error: "Phiên không tồn tại, không thuộc tài khoản này hoặc đã lưu." },
          { status: 409 }
        );
      }

      if (error.message.includes("ACTOR_NOT_ACTIVE")) {
        return NextResponse.json(
          { error: "Tài khoản không hoạt động." },
          { status: 401 }
        );
      }

      if (error.message.includes("LOCATION_NOTE_TOO_LONG")) {
        return NextResponse.json(
          { error: "Ghi chú vị trí tối đa 500 ký tự." },
          { status: 400 }
        );
      }

      console.error("SCAN_INCREMENT_ERROR", error);

      return NextResponse.json(
        { error: "Không thể cập nhật số lượng." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      item: Array.isArray(data) ? data[0] : data,
    });
  } catch (error) {
    console.error("SCAN_INCREMENT_UNEXPECTED", error);

    return NextResponse.json(
      { error: "Không thể quét mã sản phẩm." },
      { status: 500 }
    );
  }
}
