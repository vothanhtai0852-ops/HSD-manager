import {
  NextResponse,
} from "next/server";
import { cookies } from "next/headers";

import {
  supabaseServer,
} from "@/lib/supabase-server";
import {
  verifySessionToken,
} from "@/lib/session";

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
  auth_mode:
    | "FIXED"
    | "GOOGLE";
  parent_id: string | null;
  display_name: string | null;
};

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeOptionalText(
  value: unknown
): string | null {
  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed || null;
}

function normalizeText(
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
      "UPDATE_USER_CURRENT_USER_ERROR:",
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

async function getTargetUser(
  id: string
): Promise<
  TargetUser | null
> {
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
        active,
        auth_mode,
        parent_id,
        display_name
      `
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "UPDATE_USER_TARGET_ERROR:",
      error
    );

    throw new Error(
      "Không thể tải tài khoản."
    );
  }

  return data as
    | TargetUser
    | null;
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

    /*
     * Sửa tài khoản là quyền ADMIN.
     * MANAGER chỉ gán/gỡ USER bằng endpoint manager-employees.
     */
    if (
      currentUser.role !==
      "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền sửa tài khoản.",
        },
        {
          status: 403,
        }
      );
    }

    const targetUser =
      await getTargetUser(id);

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

    const body =
      await request.json();

    const username =
      Object.prototype.hasOwnProperty.call(
        body,
        "username"
      )
        ? normalizeText(
            body.username
          )
        : targetUser.username;

    if (!username) {
      return NextResponse.json(
        {
          error:
            "Vui lòng nhập Username.",
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
      username !==
      targetUser.username
    ) {
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
        .neq("id", id)
        .maybeSingle();

      if (duplicateError) {
        console.error(
          "UPDATE_USER_USERNAME_CHECK_ERROR:",
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
    }

    const displayName =
      Object.prototype.hasOwnProperty.call(
        body,
        "displayName"
      )
        ? normalizeOptionalText(
            body.displayName
          )
        : targetUser.display_name;

    let active =
      targetUser.active;

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
              "Trạng thái Active không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }

      active =
        body.active;
    }

    let role: UserRole =
      targetUser.role;

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        "role"
      )
    ) {
      if (
        typeof body.role !==
        "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Role không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }

      const requestedRole =
        body.role
          .trim()
          .toUpperCase();

      if (
        requestedRole !==
          "ADMIN" &&
        requestedRole !==
          "MANAGER" &&
        requestedRole !==
          "USER"
      ) {
        return NextResponse.json(
          {
            error:
              "Role không hợp lệ.",
          },
          {
            status: 400,
          }
        );
      }

      role =
        requestedRole as UserRole;
    }

    if (
      currentUser.id ===
      targetUser.id
    ) {
      if (!active) {
        return NextResponse.json(
          {
            error:
              "Bạn không thể tự khóa tài khoản đang đăng nhập.",
          },
          {
            status: 400,
          }
        );
      }

      if (
        targetUser.role ===
          "ADMIN" &&
        role !== "ADMIN"
      ) {
        return NextResponse.json(
          {
            error:
              "Bạn không thể tự hạ quyền ADMIN của tài khoản đang đăng nhập.",
          },
          {
            status: 400,
          }
        );
      }
    }

    if (
      targetUser.role ===
        "MANAGER" &&
      role !== "MANAGER"
    ) {
      const {
        count,
        error:
          childCountError,
      } = await supabaseServer
        .from("users")
        .select(
          "id",
          {
            count: "exact",
            head: true,
          }
        )
        .eq(
          "parent_id",
          targetUser.id
        )
        .eq(
          "role",
          "USER"
        );

      if (childCountError) {
        console.error(
          "UPDATE_USER_CHILD_COUNT_ERROR:",
          childCountError
        );

        return NextResponse.json(
          {
            error:
              "Không thể kiểm tra nhân viên trực thuộc.",
          },
          {
            status: 500,
          }
        );
      }

      if (
        (count ?? 0) > 0
      ) {
        return NextResponse.json(
          {
            error:
              "Manager này vẫn đang quản lý nhân viên. Hãy gỡ nhân viên khỏi Manager trước khi đổi Role.",
          },
          {
            status: 409,
          }
        );
      }
    }

    let parentId =
      targetUser.parent_id;

    if (
      role !== "USER"
    ) {
      parentId = null;
    }

    if (
      role === "USER" &&
      Object.prototype.hasOwnProperty.call(
        body,
        "parentUsername"
      )
    ) {
      const requestedParent =
        normalizeOptionalText(
          body.parentUsername
        );

      if (!requestedParent) {
        parentId = null;
      } else {
        const {
          data: manager,
          error:
            managerError,
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
            "username",
            requestedParent
          )
          .maybeSingle();

        if (managerError) {
          console.error(
            "UPDATE_USER_MANAGER_ERROR:",
            managerError
          );

          return NextResponse.json(
            {
              error:
                "Không thể kiểm tra Manager.",
            },
            {
              status: 500,
            }
          );
        }

        if (
          !manager ||
          !manager.active ||
          manager.role !==
            "MANAGER"
        ) {
          return NextResponse.json(
            {
              error:
                "Manager không tồn tại hoặc không hợp lệ.",
            },
            {
              status: 400,
            }
          );
        }

        parentId =
          manager.id;
      }
    }

    const {
      data: updatedUser,
      error: updateError,
    } = await supabaseServer
      .from("users")
      .update({
        username,
        display_name:
          displayName,
        role,
        active,
        parent_id:
          parentId,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
          id,
          username,
          role,
          active,
          auth_mode,
          parent_id,
          display_name,
          created_at,
          updated_at
        `
      )
      .single();

    if (updateError) {
      console.error(
        "UPDATE_USER_DATABASE_ERROR:",
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
            "Không thể cập nhật tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    let parent:
      | {
          username: string;
          display_name:
            | string
            | null;
        }
      | null = null;

    if (
      updatedUser.parent_id
    ) {
      const {
        data: parentUser,
        error:
          parentLoadError,
      } = await supabaseServer
        .from("users")
        .select(
          `
            username,
            display_name
          `
        )
        .eq(
          "id",
          updatedUser.parent_id
        )
        .maybeSingle();

      if (parentLoadError) {
        console.error(
          "UPDATE_USER_PARENT_LOAD_ERROR:",
          parentLoadError
        );
      }

      if (parentUser) {
        parent = {
          username:
            parentUser.username,
          display_name:
            parentUser.display_name,
        };
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "Cập nhật tài khoản thành công.",
      user: {
        id:
          updatedUser.id,
        username:
          updatedUser.username,
        displayName:
          updatedUser.display_name,
        role:
          updatedUser.role,
        active:
          updatedUser.active,
        authMode:
          updatedUser.auth_mode,
        parentId:
          updatedUser.parent_id,
        parent,
        createdAt:
          updatedUser.created_at,
        updatedAt:
          updatedUser.updated_at,
      },
    });
  } catch (error) {
    console.error(
      "UPDATE_USER_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi cập nhật tài khoản.",
      },
      {
        status: 500,
      }
    );
  }
}

// ======================================================
// DELETE
// XÓA TÀI KHOẢN
// Chỉ ADMIN. Không cho tự xóa.
// Chỉ hard-delete khi không còn dữ liệu bị FK RESTRICT.
// ======================================================

export async function DELETE(
  _request: Request,
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

    if (
      currentUser.role !==
      "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền xóa tài khoản.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      currentUser.id === id
    ) {
      return NextResponse.json(
        {
          error:
            "Bạn không thể tự xóa tài khoản đang đăng nhập.",
        },
        {
          status: 400,
        }
      );
    }

    const targetUser =
      await getTargetUser(id);

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

    /*
     * users.parent_id dùng ON DELETE RESTRICT.
     * Manager còn nhân viên thì phải gỡ nhân viên trước.
     */
    const {
      count: childCount,
      error: childError,
    } = await supabaseServer
      .from("users")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "parent_id",
        id
      );

    if (childError) {
      console.error(
        "DELETE_USER_CHILD_CHECK_ERROR:",
        childError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra nhân viên trực thuộc.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      (childCount ?? 0) > 0
    ) {
      return NextResponse.json(
        {
          error:
            `Không thể xóa "${targetUser.username}" vì tài khoản này vẫn đang quản lý ${childCount} nhân viên. Hãy gỡ nhân viên khỏi Manager trước.`,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * products.user_id dùng ON DELETE RESTRICT.
     * Không xóa products chỉ để xóa user, vì sẽ mất dữ liệu HSD.
     */
    const {
      count: productCount,
      error: productError,
    } = await supabaseServer
      .from("products")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "user_id",
        id
      );

    if (productError) {
      console.error(
        "DELETE_USER_PRODUCT_CHECK_ERROR:",
        productError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra dữ liệu sản phẩm của tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * alert_logs.user_id cũng ON DELETE RESTRICT.
     */
    const {
      count: alertLogCount,
      error: alertLogError,
    } = await supabaseServer
      .from("alert_logs")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "user_id",
        id
      );

    if (alertLogError) {
      console.error(
        "DELETE_USER_ALERT_LOG_CHECK_ERROR:",
        alertLogError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra lịch sử cảnh báo của tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * catalog_import_jobs.actor_user_id là RESTRICT.
     * Thường chỉ ADMIN từng upload DATA mới có record ở đây.
     */
    const {
      count: importJobCount,
      error: importJobError,
    } = await supabaseServer
      .from("catalog_import_jobs")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "actor_user_id",
        id
      );

    if (importJobError) {
      console.error(
        "DELETE_USER_IMPORT_JOB_CHECK_ERROR:",
        importJobError
      );

      /*
       * Không cho lỗi kiểm tra dependency biến thành xóa mù.
       */
      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra lịch sử cập nhật DATA của tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    const dependencies = [
      (productCount ?? 0) > 0
        ? `${productCount} sản phẩm HSD`
        : null,
      (alertLogCount ?? 0) > 0
        ? `${alertLogCount} lịch sử cảnh báo`
        : null,
      (importJobCount ?? 0) > 0
        ? `${importJobCount} phiên cập nhật DATA`
        : null,
    ].filter(
      (value): value is string =>
        Boolean(value)
    );

    if (
      dependencies.length > 0
    ) {
      return NextResponse.json(
        {
          error:
            `Không thể xóa hẳn "${targetUser.username}" vì còn ${dependencies.join(
              ", "
            )}. Hãy dùng Sửa → bỏ Active để khóa tài khoản và giữ nguyên dữ liệu lịch sử.`,
        },
        {
          status: 409,
        }
      );
    }

    /*
     * Các bảng sau đã được schema cấu hình CASCADE/SET NULL:
     * - user_emails: CASCADE
     * - sessions: CASCADE
     * - alert_configs: CASCADE
     * - history_logs.actor_user_id: SET NULL
     * - reports.user_id: SET NULL
     */
    const {
      error: deleteError,
    } = await supabaseServer
      .from("users")
      .delete()
      .eq(
        "id",
        id
      );

    if (deleteError) {
      console.error(
        "DELETE_USER_DATABASE_ERROR:",
        deleteError
      );

      if (
        deleteError.code ===
        "23503"
      ) {
        return NextResponse.json(
          {
            error:
              "Tài khoản vẫn còn dữ liệu liên kết nên chưa thể xóa hẳn. Hãy khóa tài khoản bằng Active = OFF để giữ dữ liệu.",
          },
          {
            status: 409,
          }
        );
      }

      return NextResponse.json(
        {
          error:
            "Không thể xóa tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message:
        `Đã xóa tài khoản "${targetUser.username}".`,
    });
  } catch (error) {
    console.error(
      "DELETE_USER_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi xóa tài khoản.",
      },
      {
        status: 500,
      }
    );
  }
}

