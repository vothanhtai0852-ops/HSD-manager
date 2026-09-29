import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";
import { buildAlertGroups } from "@/lib/alerts/build-alert-groups";

type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "USER";

type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
};

async function getCurrentUser(): Promise<
  | {
      user: CurrentUser;
      error: null;
    }
  | {
      user: null;
      error: NextResponse;
    }
> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      "hsd_session"
    )?.value;

  if (!token) {
    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Chưa đăng nhập.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  const session =
    await verifySessionToken(
      token
    );

  if (!session) {
    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Phiên đăng nhập không hợp lệ.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  const {
    data,
    error,
  } = await supabaseServer
    .from("users")
    .select(`
      id,
      username,
      role,
      active
    `)
    .eq(
      "id",
      session.userId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "ALERT_PREVIEW_USER_ERROR:",
      error
    );

    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Không thể kiểm tra tài khoản.",
          },
          {
            status: 500,
          }
        ),
    };
  }

  if (
    !data ||
    !data.active
  ) {
    return {
      user: null,

      error:
        NextResponse.json(
          {
            error:
              "Tài khoản không hợp lệ.",
          },
          {
            status: 401,
          }
        ),
    };
  }

  return {
    user:
      data as CurrentUser,

    error: null,
  };
}

export async function GET() {
  try {
    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    if (
      auth.user.role !==
      "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền xem trước cảnh báo toàn hệ thống.",
        },
        {
          status: 403,
        }
      );
    }

    const result =
      await buildAlertGroups();

    return NextResponse.json({
      success: true,

      preview: true,

      writesPerformed:
        false,

      emailsSent: 0,

      today:
        result.today,

      summary:
        result.summary,

      groups:
        result.groups,
    });
  } catch (error) {
    console.error(
      "ALERT_PREVIEW_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi xem trước cảnh báo.",
      },
      {
        status: 500,
      }
    );
  }
}