import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  sendAlerts,
} from "@/lib/alerts/send-alerts";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(
  request: NextRequest
) {
  /*
   * ================================================
   * 1. KIỂM TRA CRON_SECRET
   * ================================================
   */

  const cronSecret =
    process.env.CRON_SECRET;


  if (!cronSecret) {
    console.error(
      "CRON_ALERTS_ERROR: Thiếu CRON_SECRET."
    );

    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Server chưa cấu hình CRON_SECRET.",
      },
      {
        status: 500,
      }
    );
  }


  const authorization =
    request.headers.get(
      "authorization"
    );


  if (
    authorization !==
    `Bearer ${cronSecret}`
  ) {
    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Không có quyền chạy cron cảnh báo.",
      },
      {
        status: 401,
      }
    );
  }


  /*
   * ================================================
   * 2. GỌI SHARED ALERT ENGINE
   * ================================================
   */

  try {
    const result =
      await sendAlerts();

    return NextResponse.json(
      result,
      {
        status:
          result.success
            ? 200
            : 500,
      }
    );
  } catch (error) {
    console.error(
      "CRON_ALERT_ROUTE_ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Không thể xử lý cron cảnh báo.",
      },
      {
        status: 500,
      }
    );
  }
}