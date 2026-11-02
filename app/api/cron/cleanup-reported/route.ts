import { NextResponse } from "next/server";

import {
  supabaseServer,
} from "@/lib/supabase-server";

const AUTO_DELETE_AFTER_DAYS = 7;

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      deletedCount: 0,
      error: "Không có quyền chạy cleanup.",
    },
    {
      status: 401,
    }
  );
}

export async function GET(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CLEANUP_CRON_SECRET_MISSING");

      return NextResponse.json(
        {
          success: false,
          deletedCount: 0,
          error: "CRON_SECRET chưa được cấu hình.",
        },
        {
          status: 500,
        }
      );
    }

    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${cronSecret}`) {
      return unauthorized();
    }

    const { data, error } = await supabaseServer.rpc(
      "cleanup_reported_products",
      {
        p_after_days: AUTO_DELETE_AFTER_DAYS,
      }
    );

    if (error) {
      console.error("CLEANUP_REPORTED_PRODUCTS_ERROR:", error);

      return NextResponse.json(
        {
          success: false,
          deletedCount: 0,
          error: "Không thể tự động xóa sản phẩm đã báo.",
        },
        {
          status: 500,
        }
      );
    }

    const deletedCount =
      typeof data === "number"
        ? data
        : Number(data ?? 0);

    return NextResponse.json({
      success: true,
      deletedCount,
      afterDays: AUTO_DELETE_AFTER_DAYS,
      message:
        deletedCount > 0
          ? `Đã tự động xóa ${deletedCount} sản phẩm ĐÃ BÁO quá 7 ngày.`
          : "Không có sản phẩm ĐÃ BÁO nào đủ điều kiện tự động xóa.",
    });
  } catch (error) {
    console.error("CLEANUP_REPORTED_PRODUCTS_CRON_ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        deletedCount: 0,
        error: "Có lỗi xảy ra khi chạy cleanup sản phẩm.",
      },
      {
        status: 500,
      }
    );
  }
}
