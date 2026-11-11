
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  getScanActor,
  getScanSession,
  isUuid,
  type ScanActor,
} from "@/lib/scan";

type Context = {
  params: Promise<{ sessionId: string; itemId: string }>;
};

async function checkItemAccess(
  actor: ScanActor,
  sessionId: string,
  itemId: string
) {
  const access = await getScanSession(actor, sessionId);

  if (access.forbidden) {
    return NextResponse.json(
      { error: "Không có quyền sửa phiên này." },
      { status: 403 }
    );
  }

  if (!access.session) {
    return NextResponse.json(
      { error: "Không tìm thấy phiên." },
      { status: 404 }
    );
  }

  if (access.session.user_id !== actor.id) {
    return NextResponse.json(
      { error: "Chỉ người tạo phiên mới được sửa." },
      { status: 403 }
    );
  }

  if (access.session.status !== "DRAFT") {
    return NextResponse.json(
      { error: "Phiên đã lưu, không thể sửa." },
      { status: 409 }
    );
  }

  const { data, error } = await supabaseServer
    .from("scan_items")
    .select("id")
    .eq("id", itemId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return NextResponse.json(
      { error: "Không tìm thấy sản phẩm trong phiên." },
      { status: 404 }
    );
  }

  return null;
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await getScanActor();
  if (auth.error) return auth.error;

  const { sessionId, itemId } = await context.params;

  if (!isUuid(sessionId) || !isUuid(itemId)) {
    return NextResponse.json(
      { error: "Mã không hợp lệ." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const quantity = Number(body.quantity);

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 1000000
  ) {
    return NextResponse.json(
      { error: "Số lượng phải từ 1 đến 1.000.000." },
      { status: 400 }
    );
  }

  try {
    const denied = await checkItemAccess(
      auth.actor,
      sessionId,
      itemId
    );

    if (denied) return denied;

    // Chỉ cập nhật số lượng.
    // Không thay đổi location_note hoặc ghi chú cũ.
    const { data, error } = await supabaseServer
      .from("scan_items")
      .update({
        quantity,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("session_id", sessionId)
      .select(
        "id, product_code, product_name, quantity, note, location_note, created_at, updated_at"
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("SCAN_ITEM_UPDATE_ERROR", error);

    return NextResponse.json(
      { error: "Không thể lưu thay đổi." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: Context
) {
  const auth = await getScanActor();
  if (auth.error) return auth.error;

  const { sessionId, itemId } = await context.params;

  if (!isUuid(sessionId) || !isUuid(itemId)) {
    return NextResponse.json(
      { error: "Mã không hợp lệ." },
      { status: 400 }
    );
  }

  try {
    const denied = await checkItemAccess(
      auth.actor,
      sessionId,
      itemId
    );

    if (denied) return denied;

    const { error } = await supabaseServer
      .from("scan_items")
      .delete()
      .eq("id", itemId)
      .eq("session_id", sessionId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("SCAN_ITEM_DELETE_ERROR", error);

    return NextResponse.json(
      { error: "Không thể xóa sản phẩm." },
      { status: 500 }
    );
  }
}
