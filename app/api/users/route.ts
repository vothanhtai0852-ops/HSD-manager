import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

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

type UserRow = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
  auth_mode: "FIXED" | "GOOGLE";
  parent_id: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

type UserEmailRow = {
  id: string;
  user_id: string;
  email: string;
  active: boolean;
  is_primary: boolean;
};

// ======================================================
// HELPERS
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
    .eq("id", session.userId)
    .maybeSingle();

  if (userError) {
    console.error(
      "USERS_CURRENT_USER_ERROR:",
      userError
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
    !currentUser ||
    !currentUser.active
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
      currentUser as CurrentUser,

    error: null,
  };
}

function normalizeText(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeOptionalText(
  value: unknown
): string | null {
  const text =
    normalizeText(value);

  return text || null;
}

function isValidEmail(
  value: string
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function isValidUsername(
  value: string
): boolean {
  return /^[A-Za-z0-9._-]{2,50}$/.test(
    value
  );
}

// ======================================================
// GET
// DANH SÁCH TÀI KHOẢN
// ======================================================

export async function GET() {
  try {
    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser =
      auth.user;

    let users: UserRow[] = [];

    // ==================================================
    // ADMIN
    // Xem toàn bộ tài khoản
    // ==================================================

    if (
      currentUser.role === "ADMIN"
    ) {
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
            display_name,
            created_at,
            updated_at
          `
        )
        .order("username", {
          ascending: true,
        });

      if (error) {
        console.error(
          "USERS_LIST_ADMIN_ERROR:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải danh sách tài khoản.",
          },
          {
            status: 500,
          }
        );
      }

      users =
        (data ?? []) as UserRow[];
    }

    // ==================================================
    // MANAGER
    // Xem bản thân + USER trực thuộc
    // ==================================================

    if (
      currentUser.role ===
      "MANAGER"
    ) {
      const {
        data: employees,
        error: employeeError,
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
            display_name,
            created_at,
            updated_at
          `
        )
        .eq(
          "parent_id",
          currentUser.id
        )
        .eq("role", "USER")
        .eq("active", true)
        .order("username", {
          ascending: true,
        });

      if (employeeError) {
        console.error(
          "USERS_LIST_MANAGER_ERROR:",
          employeeError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải danh sách nhân viên.",
          },
          {
            status: 500,
          }
        );
      }

      const {
        data: self,
        error: selfError,
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
            display_name,
            created_at,
            updated_at
          `
        )
        .eq(
          "id",
          currentUser.id
        )
        .single();

      if (selfError) {
        console.error(
          "USERS_MANAGER_SELF_ERROR:",
          selfError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải thông tin tài khoản.",
          },
          {
            status: 500,
          }
        );
      }

      users = [
        self as UserRow,
        ...((employees ??
          []) as UserRow[]),
      ];
    }

    // ==================================================
    // USER
    // Chỉ xem chính mình
    // ==================================================

    if (
      currentUser.role === "USER"
    ) {
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
            display_name,
            created_at,
            updated_at
          `
        )
        .eq(
          "id",
          currentUser.id
        )
        .single();

      if (error) {
        console.error(
          "USERS_LIST_USER_ERROR:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải thông tin tài khoản.",
          },
          {
            status: 500,
          }
        );
      }

      users = [
        data as UserRow,
      ];
    }

    // ==================================================
    // EMAILS
    // ==================================================

    const userIds =
      users.map(
        (user) => user.id
      );

    let emails:
      UserEmailRow[] = [];

    if (
      userIds.length > 0
    ) {
      const {
        data: emailRows,
        error: emailError,
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
        .in(
          "user_id",
          userIds
        )
        .order("is_primary", {
          ascending: false,
        });

      if (emailError) {
        console.error(
          "USERS_EMAILS_ERROR:",
          emailError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải email tài khoản.",
          },
          {
            status: 500,
          }
        );
      }

      emails =
        (emailRows ??
          []) as UserEmailRow[];
    }

    // ==================================================
    // PARENTS
    // ==================================================

    const parentIds = [
      ...new Set(
        users
          .map(
            (user) =>
              user.parent_id
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(value)
          )
      ),
    ];

    const parentMap =
      new Map<
        string,
        {
          username: string;
          display_name:
            | string
            | null;
        }
      >();

    if (
      parentIds.length > 0
    ) {
      const {
        data: parents,
        error: parentError,
      } = await supabaseServer
        .from("users")
        .select(
          `
            id,
            username,
            display_name
          `
        )
        .in(
          "id",
          parentIds
        );

      if (parentError) {
        console.error(
          "USERS_PARENTS_ERROR:",
          parentError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải thông tin quản lý.",
          },
          {
            status: 500,
          }
        );
      }

      for (
        const parent of
        parents ?? []
      ) {
        parentMap.set(
          parent.id,
          {
            username:
              parent.username,

            display_name:
              parent.display_name,
          }
        );
      }
    }

    // ==================================================
    // RESPONSE DATA
    // ==================================================

    const result =
      users.map((user) => {
        const userEmails =
          emails.filter(
            (email) =>
              email.user_id ===
              user.id
          );

        const parent =
          user.parent_id
            ? parentMap.get(
                user.parent_id
              ) ?? null
            : null;

        return {
          id: user.id,

          username:
            user.username,

          displayName:
            user.display_name,

          role:
            user.role,

          active:
            user.active,

          authMode:
            user.auth_mode,

          parentId:
            user.parent_id,

          parent,

          emails:
            userEmails.map(
              (email) => ({
                id: email.id,

                email:
                  email.email,

                active:
                  email.active,

                isPrimary:
                  email.is_primary,
              })
            ),

          createdAt:
            user.created_at,

          updatedAt:
            user.updated_at,
        };
      });

    return NextResponse.json({
      success: true,

      currentUser: {
        id:
          currentUser.id,

        username:
          currentUser.username,

        role:
          currentUser.role,
      },

      canCreateUsers:
        currentUser.role ===
        "ADMIN",

      users: result,
    });
  } catch (error) {
    console.error(
      "USERS_GET_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi tải tài khoản.",
      },
      {
        status: 500,
      }
    );
  }
}

// ======================================================
// POST
// THÊM TÀI KHOẢN
// CHỈ ADMIN
// ======================================================

export async function POST(
  request: Request
) {
  try {
    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    const currentUser =
      auth.user;

    // ==================================================
    // PERMISSION
    // ==================================================

    if (
      currentUser.role !== "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền thêm tài khoản.",
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

    const username =
      normalizeText(
        body.username
      );

    const displayName =
      normalizeOptionalText(
        body.displayName
      );

    const email =
      normalizeText(
        body.email
      ).toLowerCase();

    const password =
      typeof body.password ===
      "string"
        ? body.password
        : "";

    const role =
      normalizeText(
        body.role
      ).toUpperCase() as UserRole;

    const parentUsername =
      normalizeOptionalText(
        body.parentUsername
      );

    const active =
      typeof body.active ===
      "boolean"
        ? body.active
        : true;

    // ==================================================
    // VALIDATE USERNAME
    // ==================================================

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
            "Username chỉ được dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.",
        },
        {
          status: 400,
        }
      );
    }

    // ==================================================
    // VALIDATE ROLE
    // ==================================================

    if (
      role !== "ADMIN" &&
      role !== "MANAGER" &&
      role !== "USER"
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

    // ==================================================
    // VALIDATE EMAIL
    // ==================================================

    if (
      !email ||
      !isValidEmail(email)
    ) {
      return NextResponse.json(
        {
          error:
            "Email không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    // ==================================================
    // VALIDATE PASSWORD
    // ==================================================

    if (
      password.length < 8
    ) {
      return NextResponse.json(
        {
          error:
            "Mật khẩu phải có ít nhất 8 ký tự.",
        },
        {
          status: 400,
        }
      );
    }

    // ==================================================
    // CHECK USERNAME
    // ==================================================

    const {
      data: existingUsername,
      error: usernameError,
    } = await supabaseServer
      .from("users")
      .select("id")
      .ilike(
        "username",
        username
      )
      .maybeSingle();

    if (usernameError) {
      console.error(
        "CREATE_USER_USERNAME_ERROR:",
        usernameError
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

    if (
      existingUsername
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

    // ==================================================
    // CHECK EMAIL
    // ==================================================

    const {
      data: existingEmail,
      error: existingEmailError,
    } = await supabaseServer
      .from("user_emails")
      .select("id")
      .ilike(
        "email",
        email
      )
      .maybeSingle();

    if (
      existingEmailError
    ) {
      console.error(
        "CREATE_USER_EMAIL_CHECK_ERROR:",
        existingEmailError
      );

      return NextResponse.json(
        {
          error:
            "Không thể kiểm tra Email.",
        },
        {
          status: 500,
        }
      );
    }

    if (existingEmail) {
      return NextResponse.json(
        {
          error:
            "Email đã được sử dụng.",
        },
        {
          status: 409,
        }
      );
    }

    // ==================================================
    // PARENT MANAGER
    // ==================================================

    let parentId:
      | string
      | null = null;

    if (
      role === "USER" &&
      parentUsername
    ) {
      const {
        data: parent,
        error: parentError,
      } = await supabaseServer
        .from("users")
        .select(
          `
            id,
            role,
            active
          `
        )
        .ilike(
          "username",
          parentUsername
        )
        .maybeSingle();

      if (parentError) {
        console.error(
          "CREATE_USER_PARENT_ERROR:",
          parentError
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
        !parent ||
        !parent.active ||
        parent.role !==
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
        parent.id;
    }

    // ADMIN / MANAGER
    // không có parent.

    if (
      role !== "USER"
    ) {
      parentId = null;
    }

    // ==================================================
    // HASH PASSWORD
    // ==================================================

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    // ==================================================
    // CREATE USER
    // ==================================================

    const {
      data: newUser,
      error: createUserError,
    } = await supabaseServer
      .from("users")
      .insert({
        username,

        password_hash:
          passwordHash,

        role,

        active,

        auth_mode:
          "FIXED",

        parent_id:
          parentId,

        display_name:
          displayName,
      })
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

    if (createUserError) {
      console.error(
        "CREATE_USER_DATABASE_ERROR:",
        createUserError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tạo tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    // ==================================================
    // CREATE PRIMARY EMAIL
    // ==================================================

    const {
      data: newEmail,
      error: createEmailError,
    } = await supabaseServer
      .from("user_emails")
      .insert({
        user_id:
          newUser.id,

        email,

        active: true,

        is_primary: true,
      })
      .select(
        `
          id,
          email,
          active,
          is_primary
        `
      )
      .single();

    if (createEmailError) {
      console.error(
        "CREATE_USER_EMAIL_ERROR:",
        createEmailError
      );

      // Rollback tài khoản vừa tạo
      // nếu tạo email thất bại.

      const {
        error: rollbackError,
      } = await supabaseServer
        .from("users")
        .delete()
        .eq(
          "id",
          newUser.id
        );

      if (rollbackError) {
        console.error(
          "CREATE_USER_ROLLBACK_ERROR:",
          rollbackError
        );
      }

      return NextResponse.json(
        {
          error:
            "Không thể tạo email cho tài khoản.",
        },
        {
          status: 500,
        }
      );
    }

    // ==================================================
    // RESPONSE
    // ==================================================

    return NextResponse.json(
      {
        success: true,

        message:
          "Tạo tài khoản thành công.",

        user: {
          id:
            newUser.id,

          username:
            newUser.username,

          displayName:
            newUser.display_name,

          role:
            newUser.role,

          active:
            newUser.active,

          authMode:
            newUser.auth_mode,

          parentId:
            newUser.parent_id,

          email: {
            id:
              newEmail.id,

            email:
              newEmail.email,

            active:
              newEmail.active,

            isPrimary:
              newEmail.is_primary,
          },
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "USERS_POST_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi tạo tài khoản.",
      },
      {
        status: 500,
      }
    );
  }
}