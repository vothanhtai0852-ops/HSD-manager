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

type CurrentUser = {
  id: string;
  role:
    | "ADMIN"
    | "MANAGER"
    | "USER";
  active: boolean;
};

type EmailRow = {
  id: string;
  user_id: string;
  email: string;
  active: boolean;
  is_primary: boolean;
};

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeEmail(
  value: unknown
): string {
  return typeof value ===
    "string"
    ? value.trim().toLowerCase()
    : "";
}

function isValidEmail(
  value: string
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

async function getAdmin(): Promise<
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
      "EMAIL_ADMIN_CHECK_ERROR:",
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

  const user =
    data as CurrentUser;

  if (
    user.role !== "ADMIN"
  ) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền quản lý Gmail tài khoản.",
        },
        {
          status: 403,
        }
      ),
    };
  }

  return {
    user,
    error: null,
  };
}

async function getEmail(
  userId: string,
  emailId: string
): Promise<
  EmailRow | null
> {
  const {
    data,
    error,
  } = await supabaseServer
    .from("user_emails")
    .select(
      `
        id,
        user_id,
        email,
        active,
        is_primary
      `
    )
    .eq(
      "id",
      emailId
    )
    .eq(
      "user_id",
      userId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "EMAIL_LOAD_ERROR:",
      error
    );

    throw new Error(
      "Không thể tải Gmail."
    );
  }

  return data as
    | EmailRow
    | null;
}

async function ensureAnotherActiveEmail(
  userId: string,
  excludedEmailId: string
) {
  const {
    data,
    error,
  } = await supabaseServer
    .from("user_emails")
    .select(
      `
        id,
        active,
        is_primary
      `
    )
    .eq(
      "user_id",
      userId
    )
    .eq(
      "active",
      true
    )
    .neq(
      "id",
      excludedEmailId
    )
    .limit(1);

  if (error) {
    console.error(
      "EMAIL_OTHER_ACTIVE_ERROR:",
      error
    );

    throw new Error(
      "Không thể kiểm tra Gmail khác."
    );
  }

  return (
    data?.[0] ?? null
  );
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
      emailId: string;
    }>;
  }
) {
  try {
    const {
      id,
      emailId,
    } = await context.params;

    if (
      !isValidUuid(id) ||
      !isValidUuid(emailId)
    ) {
      return NextResponse.json(
        {
          error:
            "ID không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    const auth =
      await getAdmin();

    if (auth.error) {
      return auth.error;
    }

    const target =
      await getEmail(
        id,
        emailId
      );

    if (!target) {
      return NextResponse.json(
        {
          error:
            "Gmail không tồn tại trong tài khoản này.",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      await request.json();

    const updates: {
      email?: string;
      active?: boolean;
      is_primary?: boolean;
      updated_at?: string;
    } = {
      updated_at:
        new Date().toISOString(),
    };

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "email"
      )
    ) {
      const email =
        normalizeEmail(
          body.email
        );

      if (
        !email ||
        !isValidEmail(email)
      ) {
        return NextResponse.json(
          {
            error:
              "Địa chỉ Gmail không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }

      const {
        data: duplicate,
        error:
          duplicateError,
      } = await supabaseServer
        .from("user_emails")
        .select("id")
        .eq(
          "user_id",
          id
        )
        .ilike(
          "email",
          email
        )
        .neq(
          "id",
          emailId
        )
        .maybeSingle();

      if (duplicateError) {
        console.error(
          "EDIT_EMAIL_DUPLICATE_CHECK_ERROR:",
          duplicateError
        );

        return NextResponse.json(
          {
            error:
              "Không thể kiểm tra Gmail.",
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
              "Gmail này đã có trong tài khoản.",
          },
          {
            status: 409,
          }
        );
      }

      updates.email =
        email;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "active"
      )
    ) {
      if (
        typeof body.active !==
        "boolean"
      ) {
        return NextResponse.json(
          {
            error:
              "Trạng thái Gmail không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        body.active === false &&
        target.active
      ) {
        const other =
          await ensureAnotherActiveEmail(
            id,
            emailId
          );

        if (!other) {
          return NextResponse.json(
            {
              error:
                "Mỗi tài khoản phải có ít nhất 1 Gmail đang Active.",
            },
            {
              status: 400,
            }
          );
        }
      }

      updates.active =
        body.active;

      if (
        body.active === false &&
        target.is_primary
      ) {
        updates.is_primary =
          false;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "isPrimary"
      )
    ) {
      if (
        typeof body.isPrimary !==
        "boolean"
      ) {
        return NextResponse.json(
          {
            error:
              "Trạng thái Gmail chính không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        body.isPrimary === true
      ) {
        const {
          error:
            clearPrimaryError,
        } = await supabaseServer
          .from("user_emails")
          .update({
            is_primary:
              false,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "user_id",
            id
          )
          .neq(
            "id",
            emailId
          );

        if (
          clearPrimaryError
        ) {
          console.error(
            "EMAIL_CLEAR_PRIMARY_ERROR:",
            clearPrimaryError
          );

          return NextResponse.json(
            {
              error:
                "Không thể đổi Gmail chính.",
            },
            {
              status: 500,
            }
          );
        }

        updates.is_primary =
          true;

        updates.active =
          true;
      } else {
        updates.is_primary =
          false;
      }
    }

    const {
      data: updated,
      error: updateError,
    } = await supabaseServer
      .from("user_emails")
      .update(updates)
      .eq(
        "id",
        emailId
      )
      .eq(
        "user_id",
        id
      )
      .select(
        `
          id,
          email,
          active,
          is_primary
        `
      )
      .single();

    if (updateError) {
      console.error(
        "EDIT_EMAIL_ERROR:",
        updateError
      );

      if (
        updateError.code ===
        "23505"
      ) {
        return NextResponse.json(
          {
            error:
              "Gmail này đã có trong tài khoản.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "Không thể cập nhật Gmail.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Nếu vừa tắt Gmail chính,
     * tự chọn 1 Gmail active khác làm chính.
     */
    if (
      target.is_primary &&
      updated.active === false
    ) {
      const other =
        await ensureAnotherActiveEmail(
          id,
          emailId
        );

      if (other) {
        await supabaseServer
          .from("user_emails")
          .update({
            is_primary:
              true,
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            other.id
          )
          .eq(
            "user_id",
            id
          );
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "Đã cập nhật Gmail.",
      email: {
        id:
          updated.id,
        email:
          updated.email,
        active:
          updated.active,
        isPrimary:
          updated.is_primary,
      },
    });
  } catch (error) {
    console.error(
      "EDIT_EMAIL_ROUTE_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi cập nhật Gmail.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
      emailId: string;
    }>;
  }
) {
  try {
    const {
      id,
      emailId,
    } = await context.params;

    if (
      !isValidUuid(id) ||
      !isValidUuid(emailId)
    ) {
      return NextResponse.json(
        {
          error:
            "ID không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    const auth =
      await getAdmin();

    if (auth.error) {
      return auth.error;
    }

    const target =
      await getEmail(
        id,
        emailId
      );

    if (!target) {
      return NextResponse.json(
        {
          error:
            "Gmail không tồn tại trong tài khoản này.",
        },
        {
          status: 404,
        }
      );
    }

    const other =
      target.active
        ? await ensureAnotherActiveEmail(
            id,
            emailId
          )
        : null;

    if (
      target.active &&
      !other
    ) {
      return NextResponse.json(
        {
          error:
            "Không thể xóa Gmail Active cuối cùng của tài khoản.",
        },
        {
          status: 400,
        }
      );
    }

    const {
      error: deleteError,
    } = await supabaseServer
      .from("user_emails")
      .delete()
      .eq(
        "id",
        emailId
      )
      .eq(
        "user_id",
        id
      );

    if (deleteError) {
      console.error(
        "DELETE_EMAIL_ERROR:",
        deleteError
      );

      return NextResponse.json(
        {
          error:
            "Không thể xóa Gmail.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      target.is_primary &&
      other
    ) {
      const {
        error:
          newPrimaryError,
      } = await supabaseServer
        .from("user_emails")
        .update({
          is_primary:
            true,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          other.id
        )
        .eq(
          "user_id",
          id
        );

      if (newPrimaryError) {
        console.error(
          "DELETE_EMAIL_NEW_PRIMARY_ERROR:",
          newPrimaryError
        );
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "Đã xóa Gmail.",
    });
  } catch (error) {
    console.error(
      "DELETE_EMAIL_ROUTE_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi xóa Gmail.",
      },
      {
        status: 500,
      }
    );
  }
}
