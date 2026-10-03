import {
  NextResponse,
} from "next/server";
import {
  cookies,
} from "next/headers";

import {
  supabaseServer,
} from "@/lib/supabase-server";
import {
  verifySessionToken,
} from "@/lib/session";

function normalizeUsername(
  value: unknown
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}

function isValidUsername(
  value: string
): boolean {
  return /^[A-Za-z0-9._-]{2,50}$/.test(
    value
  );
}

export async function PATCH(
  request: Request
) {
  try {
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

    const {
      data: currentUser,
      error:
        currentUserError,
    } = await supabaseServer
      .from("users")
      .select(
        `
          id,
          username,
          active
        `
      )
      .eq(
        "id",
        session.userId
      )
      .maybeSingle();

    if (currentUserError) {
      console.error(
        "RENAME_USERNAME_CURRENT_USER_ERROR:",
        currentUserError
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

    const body =
      await request.json();

    const username =
      normalizeUsername(
        body?.username
      );

    if (!username) {
      return NextResponse.json(
        {
          error:
            "Vui lòng nhập Username mới.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !isValidUsername(
        username
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Username chỉ được dùng chữ, số, dấu chấm, gạch dưới, gạch ngang và dài 2-50 ký tự.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      username.toLowerCase() ===
      currentUser.username.toLowerCase()
    ) {
      if (
        username ===
        currentUser.username
      ) {
        return NextResponse.json({
          success: true,
          message:
            "Username không thay đổi.",
          username:
            currentUser.username,
        });
      }
    }

    const {
      data: duplicate,
      error:
        duplicateError,
    } = await supabaseServer
      .from("users")
      .select("id")
      .ilike(
        "username",
        username
      )
      .neq(
        "id",
        currentUser.id
      )
      .maybeSingle();

    if (duplicateError) {
      console.error(
        "RENAME_USERNAME_DUPLICATE_CHECK_ERROR:",
        duplicateError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra Username.",
        },
        {
          status: 500,
        }
      );
    }

    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "Username đã tồn tại.",
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: updatedUser,
      error: updateError,
    } = await supabaseServer
      .from("users")
      .update({
        username,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        currentUser.id
      )
      .select(
        `
          id,
          username
        `
      )
      .single();

    if (updateError) {
      console.error(
        "RENAME_USERNAME_UPDATE_ERROR:",
        updateError
      );

      if (
        updateError.code ===
        "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "Username đã tồn tại.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "Không thể đổi Username.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        "Đổi Username thành công.",
      username:
        updatedUser.username,
    });
  } catch (error) {
    console.error(
      "RENAME_USERNAME_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi đổi Username.",
      },
      {
        status: 500,
      }
    );
  }
}
