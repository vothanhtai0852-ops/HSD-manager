import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";

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

type TargetUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
  parent_id: string | null;
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

      error: NextResponse.json(
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

      error: NextResponse.json(
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

  if (error) {
    console.error(
      "PASSWORD_CURRENT_USER_ERROR:",
      error
    );

    return {
      user: null,

      error: NextResponse.json(
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

      error: NextResponse.json(
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

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } =
      await context.params;

    if (!isValidUuid(id)) {
      return NextResponse.json(
        {
          error:
            "ID tài khoản không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser =
      auth.user;

    const {
      data: targetUser,
      error: targetError,
    } = await supabaseServer
      .from("users")
      .select(
        `
          id,
          username,
          role,
          active,
          parent_id
        `
      )
      .eq("id", id)
      .maybeSingle();

    if (targetError) {
      console.error(
        "PASSWORD_TARGET_USER_ERROR:",
        targetError
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

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            "Tài khoản không tồn tại.",
        },
        {
          status: 404,
        }
      );
    }

    // =========================================
    // PERMISSION
    // =========================================

    const isSelf =
      currentUser.id ===
      targetUser.id;

    const isAdmin =
      currentUser.role ===
      "ADMIN";

    const isManagedEmployee =
      currentUser.role ===
        "MANAGER" &&
      targetUser.role ===
        "USER" &&
      targetUser.parent_id ===
        currentUser.id;

    if (
      !isSelf &&
      !isAdmin &&
      !isManagedEmployee
    ) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền đổi mật khẩu tài khoản này.",
        },
        {
          status: 403,
        }
      );
    }

    // =========================================
    // BODY
    // =========================================

    const body =
      await request.json();

    const newPassword =
      typeof body.newPassword ===
      "string"
        ? body.newPassword
        : "";

    const currentPassword =
      typeof body.currentPassword ===
      "string"
        ? body.currentPassword
        : "";

    if (
      newPassword.length < 8
    ) {
      return NextResponse.json(
        {
          error:
            "Mật khẩu mới phải có ít nhất 8 ký tự.",
        },
        {
          status: 400,
        }
      );
    }

    // =========================================
    // SELF CHANGE
    // Nếu tự đổi mật khẩu thì phải nhập
    // mật khẩu hiện tại.
    // ADMIN/MANAGER reset cho người khác
    // thì không cần mật khẩu cũ của họ.
    // =========================================

    if (isSelf) {
      if (!currentPassword) {
        return NextResponse.json(
          {
            error:
              "Vui lòng nhập mật khẩu hiện tại.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: passwordUser,
        error: passwordUserError,
      } = await supabaseServer
        .from("users")
        .select(
          `
            password_hash
          `
        )
        .eq(
          "id",
          currentUser.id
        )
        .single();

      if (passwordUserError) {
        console.error(
          "PASSWORD_VERIFY_LOAD_ERROR:",
          passwordUserError
        );

        return NextResponse.json(
          {
            error:
              "Không thể kiểm tra mật khẩu hiện tại.",
          },
          {
            status: 500,
          }
        );
      }

      const passwordOk =
        await bcrypt.compare(
          currentPassword,
          passwordUser.password_hash
        );

      if (!passwordOk) {
        return NextResponse.json(
          {
            error:
              "Mật khẩu hiện tại không đúng.",
          },
          {
            status: 400,
          }
        );
      }
    }

    // =========================================
    // HASH
    // =========================================

    const passwordHash =
      await bcrypt.hash(
        newPassword,
        12
      );

    // =========================================
    // UPDATE
    // =========================================

    const {
      error: updateError,
    } = await supabaseServer
      .from("users")
      .update({
        password_hash:
          passwordHash,

        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error(
        "PASSWORD_UPDATE_ERROR:",
        updateError
      );

      return NextResponse.json(
        {
          error:
            "Không thể cập nhật mật khẩu.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,

      message: isSelf
        ? "Đổi mật khẩu thành công."
        : "Đặt lại mật khẩu thành công.",
    });
  } catch (error) {
    console.error(
      "PASSWORD_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi cập nhật mật khẩu.",
      },
      {
        status: 500,
      }
    );
  }
}