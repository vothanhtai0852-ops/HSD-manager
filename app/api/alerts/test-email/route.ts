import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  gmailSender,
  mailer,
} from "@/lib/mailer";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";

export async function POST() {
  try {
    // =========================================
    // SESSION
    // =========================================

    const cookieStore =
      await cookies();

    const token =
      cookieStore.get(
        "hsd_session"
      )?.value;

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Chưa đăng nhập.",
        },
        {
          status: 401,
        }
      );
    }

    const session =
      await verifySessionToken(
        token
      );

    if (!session) {
      return NextResponse.json(
        {
          error:
            "Phiên đăng nhập không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }

    // =========================================
    // CURRENT USER
    // =========================================

    const {
      data: currentUser,
      error: userError,
    } = await supabaseServer
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

    if (userError) {
      console.error(
        "TEST_EMAIL_USER_ERROR:",
        userError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !currentUser ||
      !currentUser.active
    ) {
      return NextResponse.json(
        {
          error:
            "Tài khoản không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }

    // =========================================
    // ADMIN ONLY
    // =========================================

    if (
      currentUser.role !==
      "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền gửi email test.",
        },
        {
          status: 403,
        }
      );
    }

    // =========================================
    // SEND TEST TO THE SAME GMAIL
    // =========================================

    const info =
      await mailer.sendMail({
        from: {
          name: "HSD Manager",
          address:
            gmailSender,
        },

        to: gmailSender,

        subject:
          "HSD Manager - Gmail SMTP Test",

        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>HSD Manager</h2>

            <p>
              Gmail SMTP đã kết nối thành công.
            </p>

            <p>
              Người thực hiện:
              <strong>${currentUser.username}</strong>
            </p>

            <p>
              Đây chỉ là email kiểm tra.
              Không có trạng thái sản phẩm nào bị thay đổi.
            </p>
          </div>
        `,
      });

    // =========================================
    // RESPONSE
    // =========================================

    return NextResponse.json({
      success: true,

      message:
        "Gmail SMTP đã gửi email test thành công.",

      messageId:
        info.messageId,

      recipient:
        gmailSender,

      productsChanged:
        false,

      alertLogsCreated:
        false,
    });
  } catch (error) {
    console.error(
      "TEST_EMAIL_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Không thể gửi email test qua Gmail.",

        details:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}