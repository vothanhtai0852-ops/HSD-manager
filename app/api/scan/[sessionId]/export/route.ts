
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabase-server";
import { getScanActor, getScanSession, isUuid } from "@/lib/scan";

type Context = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, context: Context) {
  const auth = await getScanActor();
  if (auth.error) return auth.error;

  const { sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return NextResponse.json(
      { error: "Mã phiên không hợp lệ." },
      { status: 400 }
    );
  }

  try {
    const access = await getScanSession(auth.actor, sessionId);

    if (access.forbidden) {
      return NextResponse.json(
        { error: "Không có quyền xuất phiên này." },
        { status: 403 }
      );
    }

    if (!access.session) {
      return NextResponse.json(
        { error: "Không tìm thấy phiên." },
        { status: 404 }
      );
    }

    // Lấy username thật của người sở hữu phiên từ user_id
// Không lấy username của Admin/Manager đang đăng nhập.
const { data: owner, error: ownerError } = await supabaseServer
  .from("users")
  .select("username")
  .eq("id", access.session.user_id)
  .maybeSingle();

if (ownerError) throw ownerError;

const ownerUsername = String(owner?.username || "").trim();

// Không tìm được chủ nhân phiên thì dừng xuất,
// tuyệt đối không lấy nhầm tên người đang đăng nhập.
if (!ownerUsername) {
  return NextResponse.json(
    { error: "Không xác định được người sở hữu phiên kiểm hàng." },
    { status: 409 }
  );
}

const safeUsername = ownerUsername
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9_-]+/g, "_")
  .replace(/^_+|_+$/g, "") || "user";

    const { data, error } = await supabaseServer
      .from("scan_items")
      .select(
        "product_code, product_name, quantity, location_note, created_at"
      )
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const dateTimeFormat = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });

    const rows = (data || []).map((item) => ({
      USER: ownerUsername,
      MA_SP: item.product_code,
      TEN_SP: item.product_name,
      SO_LUONG: item.quantity,
      GHI_CHU: item.location_note || "",
      THOI_GIAN: dateTimeFormat.format(
        new Date(item.created_at)
      ),
    }));

    const workbook = XLSX.utils.book_new();

    const worksheet = XLSX.utils.json_to_sheet(rows, {
      header: [
        "USER",
        "MA_SP",
        "TEN_SP",
        "SO_LUONG",
        "GHI_CHU",
        "THOI_GIAN",
      ],
    });

    worksheet["!cols"] = [
      { wch: 20 },
      { wch: 20 },
      { wch: 42 },
      { wch: 12 },
      { wch: 32 },
      { wch: 22 },
    ];

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "SCAN BARCODE"
    );

    const bytes = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const exportDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replaceAll("-", "");

    const filename =
      `SCAN_BARCODE_${safeUsername}_${exportDate}.xlsx`;

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("SCAN_EXPORT_ERROR", error);

    return NextResponse.json(
      { error: "Không thể xuất Excel." },
      { status: 500 }
    );
  }
}
