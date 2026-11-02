import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";

function jsonResponse(
  body: unknown,
  status = 200,
  serverTiming?: string
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      ...(serverTiming
        ? { "Server-Timing": serverTiming }
        : {}),
    },
  });
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();

  try {
    // 1. AUTH
    const authStartedAt = performance.now();

    const cookieStore = await cookies();
    const token = cookieStore.get("hsd_session")?.value;

    if (!token) {
      return jsonResponse(
        { error: "Chưa đăng nhập." },
        401
      );
    }

    const session = await verifySessionToken(token);

    if (!session) {
      return jsonResponse(
        { error: "Phiên đăng nhập không hợp lệ." },
        401
      );
    }

    const authMs = performance.now() - authStartedAt;

    // 2. VALIDATE QUERY
    const query = (
      request.nextUrl.searchParams.get("q") || ""
    ).trim().toLowerCase();

    if (!query || query.length > 64) {
      return jsonResponse({ items: [] });
    }

    // Mã số: tối thiểu 5 chữ số.
    // Mã chứa chữ và số: tối thiểu 3 ký tự.
    const minLength = /^\d+$/.test(query) ? 5 : 3;

    if (query.length < minLength) {
      return jsonResponse({ items: [] });
    }

    if (!/^[a-zA-Z0-9._/-]+$/.test(query)) {
      return jsonResponse({ items: [] });
    }

    // Escape ký tự đặc biệt của LIKE / ILIKE.
    const safeQuery = query.replace(
      /[\\%_]/g,
      "\\$&"
    );

    // Giữ nguyên khả năng tìm chuỗi ở bất kỳ vị trí nào.
    const searchPattern = `%${safeQuery}%`;

    // 3. DATABASE SEARCH
    const dbStartedAt = performance.now();

    const {
      data,
      error,
    } = await supabaseServer
      .from("product_catalog")
      .select(`
        id,
        product_code,
        product_name,
        sale_price
      `)
      .eq("active", true)
      .ilike("product_code", searchPattern)
      .order("product_code", {
        ascending: true,
      })
      .limit(10)
      .abortSignal(request.signal);

    const dbMs = performance.now() - dbStartedAt;

    const serverTiming =
      `auth;dur=${authMs.toFixed(1)}, ` +
      `db;dur=${dbMs.toFixed(1)}, ` +
      `total;dur=${(performance.now() - startedAt).toFixed(1)}`;

    if (error) {
      console.error(
        "CATALOG_SEARCH_ERROR:",
        error
      );

      return jsonResponse(
        { error: "Không thể tìm sản phẩm." },
        500,
        serverTiming
      );
    }

    // 4. RESPONSE
    return jsonResponse(
      {
        items: (data || []).map((item) => ({
          id: item.id,
          productCode: item.product_code,
          productName: item.product_name,
          salePrice: item.sale_price,
        })),
      },
      200,
      serverTiming
    );

  } catch (error) {
    // Client đã hủy request thì không ghi nhận như lỗi hệ thống.
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }

    console.error(
      "CATALOG_SEARCH_UNEXPECTED_ERROR:",
      error
    );

    return jsonResponse(
      { error: "Không thể tìm sản phẩm." },
      500
    );
  }
}