import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  verifySessionToken,
} from "@/lib/session";

import {
  supabaseServer,
} from "@/lib/supabase-server";

import {
  sendAlerts,
} from "@/lib/alerts/send-alerts";


type SendAlertRequest = {
  confirm?: string;
};


export async function POST(
  request: NextRequest
) {
  /*
   * ================================================
   * 1. BẮT BUỘC XÁC NHẬN
   * ================================================
   */

  let body: SendAlertRequest = {};

  try {
    body =
      await request.json();
  } catch {
    body = {};
  }


  if (
    body.confirm !==
    "SEND_ALERTS"
  ) {
    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Chưa xác nhận gửi cảnh báo. Yêu cầu confirm=SEND_ALERTS.",
      },
      {
        status: 400,
      }
    );
  }


  /*
   * ================================================
   * 2. KIỂM TRA SESSION
   * ================================================
   */

  const sessionToken =
    request.cookies.get(
      "hsd_session"
    )?.value;


  if (!sessionToken) {
    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Chưa đăng nhập.",
      },
      {
        status: 401,
      }
    );
  }


  const session =
    await verifySessionToken(
      sessionToken
    );


  if (!session) {
    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
      },
      {
        status: 401,
      }
    );
  }


  /*
   * ================================================
   * 3. KIỂM TRA TÀI KHOẢN
   * ================================================
   */

  const {
    data: currentUser,
    error: userError,
  } =
    await supabaseServer
      .from("users")
      .select(
        `
          id,
          username,
          role,
          active
        `
      )
      .eq(
        "id",
        session.userId
      )
      .maybeSingle();


  if (
    userError ||
    !currentUser
  ) {
    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Không tìm thấy tài khoản.",
      },
      {
        status: 401,
      }
    );
  }


  if (!currentUser.active) {
    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Tài khoản đã bị khóa.",
      },
      {
        status: 403,
      }
    );
  }


  /*
   * ================================================
   * 4. CHỈ ADMIN
   * ================================================
   */

  if (
    currentUser.role !==
    "ADMIN"
  ) {
    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Chỉ ADMIN mới có quyền gửi cảnh báo.",
      },
      {
        status: 403,
      }
    );
  }


  /*
   * ================================================
   * 5. GỌI SHARED ALERT ENGINE
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
      "MANUAL_ALERT_ROUTE_ERROR:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        sendPerformed: false,
        emailsSent: 0,

        message:
          "Không thể xử lý gửi cảnh báo.",
      },
      {
        status: 500,
      }
    );
  }
}