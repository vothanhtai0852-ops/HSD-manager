
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getScanSession, getScanTokenActor, getScanActor, isUuid } from "@/lib/scan";

// This route must expose GET (session detail) and PATCH (complete session).
// Force a server-rendered, uncached route so deployments do not reuse stale handlers.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const auth = await getScanTokenActor();
  if (auth.error) return auth.error;

  const { sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return NextResponse.json(
      { error: "Mã phiên không hợp lệ." },
      { status: 400 }
    );
  }

  try {
    const [currentUserResult, access] = await Promise.all([
      supabaseServer.from("users").select("id, role, active")
        .eq("id", auth.actor.id).maybeSingle(),
      getScanSession(auth.actor, sessionId),
    ]);

    if (currentUserResult.error) {
      throw currentUserResult.error;
    }
    if (!currentUserResult.data?.active) {
      return NextResponse.json({ error: "Tài khoản không hoạt động." }, { status: 401 });
    }
    if (currentUserResult.data.role !== auth.actor.role) {
      return NextResponse.json({ error: "Quyền tài khoản đã thay đổi. Hãy đăng nhập lại." }, { status: 401 });
    }

    if (access.forbidden) {
      return NextResponse.json(
        { error: "Không có quyền xem phiên này." },
        { status: 403 }
      );
    }

    if (!access.session) {
      return NextResponse.json(
        { error: "Không tìm thấy phiên." },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseServer
      .from("scan_items")
      .select(
        "id, product_code, product_name, quantity, note, location_note, created_at, updated_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json(
      {
        session: access.session,
        items: data || [],
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      }
    );
  } catch (error) {
    console.error("SCAN_GET_ERROR", error);

    return NextResponse.json(
      { error: "Không tải được chi tiết phiên." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const auth = await getScanActor();
  if (auth.error) return auth.error;

  const { sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return NextResponse.json(
      { error: "Mã phiên không hợp lệ." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));

  if (body.action !== "COMPLETE") {
    return NextResponse.json(
      { error: "Thao tác không hợp lệ." },
      { status: 400 }
    );
  }

  try {
    const access = await getScanSession(auth.actor, sessionId);

    if (access.forbidden) {
      return NextResponse.json(
        { error: "Không có quyền lưu phiên này." },
        { status: 403 }
      );
    }

    if (!access.session) {
      return NextResponse.json(
        { error: "Không tìm thấy phiên." },
        { status: 404 }
      );
    }

    if (access.session.user_id !== auth.actor.id) {
      return NextResponse.json(
        { error: "Chỉ người tạo phiên mới được lưu." },
        { status: 403 }
      );
    }

    if (access.session.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Phiên đã được lưu." },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseServer
      .from("scan_sessions")
      .update({
        status: "COMPLETED",
        completed_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("user_id", auth.actor.id)
      .eq("status", "DRAFT")
      .select(
        "id, user_id, username_snapshot, status, created_at, completed_at"
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ session: data });
  } catch (error) {
    console.error("SCAN_COMPLETE_ERROR", error);

    return NextResponse.json(
      { error: "Không thể lưu phiên." },
      { status: 500 }
    );
  }
}
