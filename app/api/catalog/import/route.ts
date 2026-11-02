import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";

type AdminUser = {
  id: string;
  username: string;
  role: "ADMIN" | "MANAGER" | "USER";
  active: boolean;
};

type ImportRow = {
  rowNumber?: unknown;
  productCode?: unknown;
  productName?: unknown;
  salePrice?: unknown;
};

const MAX_TOTAL_ROWS = 300000;
const MAX_CHUNK_ROWS = 3000;

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : value === null || value === undefined
      ? ""
      : String(value).trim();
}

function normalizePrice(value: unknown): number | null | "INVALID" {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numberValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return "INVALID";
  }

  return numberValue;
}

async function getAdmin(): Promise<
  | { user: AdminUser; error: null }
  | { user: null; error: NextResponse }
> {
  const cookieStore = await cookies();
  const token = cookieStore.get("hsd_session")?.value;

  if (!token) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Chưa đăng nhập." },
        { status: 401 }
      ),
    };
  }

  const session = await verifySessionToken(token);

  if (!session) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." },
        { status: 401 }
      ),
    };
  }

  const { data, error } = await supabaseServer
    .from("users")
    .select("id, username, role, active")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    console.error("CATALOG_IMPORT_USER_ERROR:", error);

    return {
      user: null,
      error: NextResponse.json(
        { error: "Không thể kiểm tra tài khoản." },
        { status: 500 }
      ),
    };
  }

  if (!data || !data.active) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Tài khoản không hợp lệ." },
        { status: 401 }
      ),
    };
  }

  if (data.role !== "ADMIN") {
    return {
      user: null,
      error: NextResponse.json(
        { error: "Chỉ ADMIN mới có quyền cập nhật DATA." },
        { status: 403 }
      ),
    };
  }

  return {
    user: data as AdminUser,
    error: null,
  };
}

export async function GET() {
  const auth = await getAdmin();

  if (auth.error) {
    return auth.error;
  }

  const { count, error } = await supabaseServer
    .from("product_catalog")
    .select("id", {
      count: "exact",
      head: true,
    });

  if (error) {
    console.error("CATALOG_IMPORT_COUNT_ERROR:", error);

    return NextResponse.json(
      { error: "Không thể đọc số lượng DATA hiện tại." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    catalogCount: count ?? 0,
  });
}

export async function POST(request: Request) {
  const auth = await getAdmin();

  if (auth.error) {
    return auth.error;
  }

  const currentUser = auth.user;

  let body: {
    action?: unknown;
    importId?: unknown;
    fileName?: unknown;
    totalRows?: unknown;
    rows?: ImportRow[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dữ liệu gửi lên không hợp lệ." },
      { status: 400 }
    );
  }

  const action = normalizeText(body.action).toLowerCase();

  if (action === "start") {
    const fileName = normalizeText(body.fileName) || "catalog.xlsx";
    const totalRows = Number(body.totalRows);

    if (
      !Number.isInteger(totalRows) ||
      totalRows <= 0 ||
      totalRows > MAX_TOTAL_ROWS
    ) {
      return NextResponse.json(
        { error: `Số dòng DATA phải từ 1 đến ${MAX_TOTAL_ROWS}.` },
        { status: 400 }
      );
    }

    const cutoff = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { error: cleanupError } = await supabaseServer
      .from("catalog_import_jobs")
      .delete()
      .lt("created_at", cutoff)
      .neq("status", "PROCESSING");

    if (cleanupError) {
      console.error(
        "CATALOG_IMPORT_OLD_JOB_CLEANUP_ERROR:",
        cleanupError
      );
    }

    const { data, error } = await supabaseServer
      .from("catalog_import_jobs")
      .insert({
        actor_user_id: currentUser.id,
        file_name: fileName,
        total_rows: totalRows,
        status: "UPLOADING",
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("CATALOG_IMPORT_START_ERROR:", error);

      return NextResponse.json(
        { error: "Không thể bắt đầu phiên cập nhật DATA." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      importId: data.id,
    });
  }

  const importId = normalizeText(body.importId);

  if (!importId) {
    return NextResponse.json(
      { error: "Thiếu mã phiên cập nhật DATA." },
      { status: 400 }
    );
  }

  const { data: job, error: jobError } = await supabaseServer
    .from("catalog_import_jobs")
    .select("id, actor_user_id, status, total_rows")
    .eq("id", importId)
    .maybeSingle();

  if (
    jobError ||
    !job ||
    job.actor_user_id !== currentUser.id
  ) {
    return NextResponse.json(
      { error: "Không tìm thấy phiên cập nhật DATA hợp lệ." },
      { status: 404 }
    );
  }

  if (action === "chunk") {
    if (job.status !== "UPLOADING") {
      return NextResponse.json(
        { error: "Phiên cập nhật DATA không còn nhận dữ liệu." },
        { status: 409 }
      );
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (rows.length === 0 || rows.length > MAX_CHUNK_ROWS) {
      return NextResponse.json(
        { error: `Mỗi phần upload phải có từ 1 đến ${MAX_CHUNK_ROWS} dòng.` },
        { status: 400 }
      );
    }

    const normalizedRows: Array<{
      import_id: string;
      row_number: number;
      product_code: string;
      product_name: string;
      sale_price: number | null;
    }> = [];

    const codeSet = new Set<string>();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = Number(row.rowNumber);
      const productCode = normalizeText(row.productCode);
      const productName = normalizeText(row.productName);
      const salePrice = normalizePrice(row.salePrice);

      if (!Number.isInteger(rowNumber) || rowNumber <= 0) {
        return NextResponse.json(
          { error: "Có dòng DATA thiếu số thứ tự hợp lệ." },
          { status: 400 }
        );
      }

      if (!productCode) {
        return NextResponse.json(
          { error: `Dòng ${rowNumber}: thiếu mã sản phẩm.` },
          { status: 400 }
        );
      }

      if (!productName) {
        return NextResponse.json(
          { error: `Dòng ${rowNumber}: thiếu tên sản phẩm.` },
          { status: 400 }
        );
      }

      if (salePrice === "INVALID") {
        return NextResponse.json(
          { error: `Dòng ${rowNumber}: giá bán không hợp lệ.` },
          { status: 400 }
        );
      }

      const normalizedCode = productCode.toLowerCase();

      if (codeSet.has(normalizedCode)) {
        return NextResponse.json(
          { error: `Chunk có mã sản phẩm trùng: ${productCode}.` },
          { status: 400 }
        );
      }

      codeSet.add(normalizedCode);

      normalizedRows.push({
        import_id: importId,
        row_number: rowNumber,
        product_code: productCode,
        product_name: productName,
        sale_price: salePrice,
      });
    }

    const { error: insertError } = await supabaseServer
      .from("catalog_import_staging")
      .insert(normalizedRows);

    if (insertError) {
      console.error("CATALOG_IMPORT_CHUNK_ERROR:", insertError);

      const duplicate = String(insertError.message ?? "")
        .toLowerCase()
        .includes("duplicate");

      return NextResponse.json(
        {
          error: duplicate
            ? "File có mã sản phẩm trùng. DATA chưa được thay đổi."
            : "Không thể upload một phần DATA. DATA hiện tại chưa bị thay đổi.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      uploaded: normalizedRows.length,
    });
  }

  if (action === "commit") {
    if (job.status !== "UPLOADING") {
      return NextResponse.json(
        { error: "Phiên cập nhật DATA không thể commit." },
        { status: 409 }
      );
    }

    const { data, error } = await supabaseServer.rpc(
      "commit_catalog_import",
      {
        p_import_id: importId,
        p_actor_user_id: currentUser.id,
      }
    );

    if (error) {
      console.error("CATALOG_IMPORT_COMMIT_ERROR:", error);

      await supabaseServer
        .from("catalog_import_jobs")
        .update({
          status: "FAILED",
          result: {
            error: error.message,
          },
        })
        .eq("id", importId)
        .eq("actor_user_id", currentUser.id);

      return NextResponse.json(
        { error: error.message || "Không thể cập nhật DATA." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: data,
      message:
        "DATA đã được thay thế và đồng bộ giá/tên sản phẩm trên web.",
    });
  }

  if (action === "cancel") {
    if (job.status === "PROCESSING") {
      return NextResponse.json(
        { error: "DATA đang được xử lý, không thể hủy." },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabaseServer
      .from("catalog_import_jobs")
      .delete()
      .eq("id", importId)
      .eq("actor_user_id", currentUser.id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Không thể hủy phiên cập nhật DATA." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Thao tác cập nhật DATA không hợp lệ." },
    { status: 400 }
  );
}
