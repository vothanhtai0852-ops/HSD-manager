import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";

// ======================================================
// TYPES
// ======================================================

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
  auth_mode: "FIXED" | "GOOGLE";
  parent_id: string | null;
  display_name: string | null;
};

// ======================================================
// HELPERS
// ======================================================

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
  if (typeof value !== "string") {
    return null;
  }

  const trimmed =
    value.trim();

  return trimmed || null;
}

// ======================================================
// CURRENT USER
// ======================================================

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

// ======================================================
// LOAD TARGET USER
// ======================================================

async function getTargetUser(
  id: string
): Promise<TargetUser | null> {
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

// ======================================================
// PATCH
// SỬA TÀI KHOẢN
// ======================================================

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    // ==================================================
    // ID
    // ==================================================

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

    // ==================================================
    // CURRENT USER
    // ==================================================

    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser =
      auth.user;

    // ==================================================
    // TARGET USER
    // ==================================================

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

    // ==================================================
    // PERMISSION
    // ==================================================

    const isAdmin =
      currentUser.role ===
      "ADMIN";

    const isManager =
      currentUser.role ===
      "MANAGER";

    const isManagedEmployee =
      isManager &&
      targetUser.role ===
        "USER" &&
      targetUser.parent_id ===
        currentUser.id;

    if (
      !isAdmin &&
      !isManagedEmployee
    ) {
      return NextResponse.json(
        {
          error:
            "Bạn không có quyền sửa tài khoản này.",
        },
        {
          status: 403,
        }
      );
    }

    // ==================================================
    // BODY
    // ==================================================

    const body =
      await request.json();

    // ==================================================
    // DISPLAY NAME
    // ==================================================

    const displayName =
      Object.prototype.hasOwnProperty.call(
        body,
        "displayName"
      )
        ? normalizeOptionalText(
            body.displayName
          )
        : targetUser.display_name;

    // ==================================================
    // ACTIVE
    // ==================================================

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

    // ==================================================
    // ROLE
    // ==================================================

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

    // MANAGER chỉ được sửa USER
    // thuộc quyền của chính mình.
    // Không được đổi Role.

    if (
      isManager &&
      role !== "USER"
    ) {
      return NextResponse.json(
        {
          error:
            "MANAGER không có quyền thay đổi Role.",
        },
        {
          status: 403,
        }
      );
    }

    // ==================================================
    // SELF PROTECTION
    // ==================================================

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
        currentUser.role ===
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

    // ==================================================
    // PARENT MANAGER
    // ==================================================

    let parentId =
      targetUser.parent_id;

    // Role không phải USER
    // thì không có Manager.

    if (role !== "USER") {
      parentId = null;
    }

    // ADMIN được quyền đổi Manager
    // của USER.

    if (
      isAdmin &&
      role === "USER" &&
      Object.prototype.hasOwnProperty.call(
        body,
        "parentUsername"
      )
    ) {
      const parentUsername =
        normalizeOptionalText(
          body.parentUsername
        );

      if (!parentUsername) {
        parentId = null;
      } else {
        const {
          data: manager,
          error: managerError,
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
          .ilike(
            "username",
            parentUsername
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

    // MANAGER không được chuyển
    // nhân viên của mình sang Manager khác.

    if (isManager) {
      parentId =
        currentUser.id;
    }

    // ==================================================
    // UPDATE
    // ==================================================

    const {
      data: updatedUser,
      error: updateError,
    } = await supabaseServer
      .from("users")
      .update({
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

    // ==================================================
    // PARENT INFO
    // ==================================================

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
        error: parentLoadError,
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

    // ==================================================
    // RESPONSE
    // ==================================================

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