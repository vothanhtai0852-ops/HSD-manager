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

type EmployeeRow = {
  id: string;
  username: string;
  display_name: string | null;
  active: boolean;
  role: UserRole;
  parent_id: string | null;
};

function isValidUuid(
  value: string
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function getCurrentManager(): Promise<
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
      "MANAGER_EMPLOYEES_CURRENT_USER_ERROR:",
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

  const currentUser =
    data as CurrentUser;

  if (
    currentUser.role !==
    "MANAGER"
  ) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error:
            "Chức năng này chỉ dành cho MANAGER.",
        },
        {
          status: 403,
        }
      ),
    };
  }

  return {
    user: currentUser,
    error: null,
  };
}

export async function GET() {
  try {
    const auth =
      await getCurrentManager();

    if (auth.error) {
      return auth.error;
    }

    const currentManager =
      auth.user;

    const {
      data: employees,
      error: employeeError,
    } = await supabaseServer
      .from("users")
      .select(
        `
          id,
          username,
          display_name,
          active,
          role,
          parent_id
        `
      )
      .eq(
        "role",
        "USER"
      )
      .eq(
        "active",
        true
      )
      .order(
        "username",
        {
          ascending: true,
        }
      );

    if (employeeError) {
      console.error(
        "MANAGER_EMPLOYEES_LIST_ERROR:",
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

    const rows =
      (employees ??
        []) as EmployeeRow[];

    const parentIds = [
      ...new Set(
        rows
          .map(
            (item) =>
              item.parent_id
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
          "MANAGER_EMPLOYEES_PARENT_ERROR:",
          parentError
        );

        return NextResponse.json(
          {
            error:
              "Không thể tải thông tin Manager.",
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

    return NextResponse.json({
      success: true,
      currentManager: {
        id:
          currentManager.id,
        username:
          currentManager.username,
      },
      employees:
        rows.map(
          (employee) => {
            const parent =
              employee.parent_id
                ? parentMap.get(
                    employee.parent_id
                  ) ?? null
                : null;

            return {
              id:
                employee.id,
              username:
                employee.username,
              displayName:
                employee.display_name,
              active:
                employee.active,
              parentId:
                employee.parent_id,
              parentUsername:
                parent?.username ??
                null,
              parentDisplayName:
                parent?.display_name ??
                null,
            };
          }
        ),
    });
  } catch (error) {
    console.error(
      "MANAGER_EMPLOYEES_GET_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi tải danh sách nhân viên.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: Request
) {
  try {
    const auth =
      await getCurrentManager();

    if (auth.error) {
      return auth.error;
    }

    const currentManager =
      auth.user;

    const body =
      await request.json();

    if (
      !Array.isArray(
        body?.selectedUserIds
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Danh sách nhân viên không hợp lệ.",
        },
        {
          status: 400,
        }
      );
    }

    const selectedUserIds = [
      ...new Set(
        body.selectedUserIds
          .filter(
            (
              value: unknown
            ): value is string =>
              typeof value ===
                "string" &&
              isValidUuid(value)
          )
      ),
    ];

    if (
      selectedUserIds.length !==
      body.selectedUserIds.length
    ) {
      return NextResponse.json(
        {
          error:
            "Danh sách nhân viên chứa ID không hợp lệ hoặc bị trùng.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      selectedUserIds.length >
      1000
    ) {
      return NextResponse.json(
        {
          error:
            "Danh sách nhân viên quá lớn.",
        },
        {
          status: 400,
        }
      );
    }

    let selectedRows:
      EmployeeRow[] = [];

    if (
      selectedUserIds.length > 0
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
            display_name,
            active,
            role,
            parent_id
          `
        )
        .in(
          "id",
          selectedUserIds
        );

      if (error) {
        console.error(
          "MANAGER_EMPLOYEES_VALIDATE_ERROR:",
          error
        );

        return NextResponse.json(
          {
            error:
              "Không thể kiểm tra danh sách nhân viên.",
          },
          {
            status: 500,
          }
        );
      }

      selectedRows =
        (data ??
          []) as EmployeeRow[];

      if (
        selectedRows.length !==
        selectedUserIds.length
      ) {
        return NextResponse.json(
          {
            error:
              "Có tài khoản không tồn tại.",
          },
          {
            status: 400,
          }
        );
      }

      const invalidEmployee =
        selectedRows.find(
          (employee) =>
            employee.role !==
              "USER" ||
            !employee.active ||
            (
              employee.parent_id &&
              employee.parent_id !==
                currentManager.id
            )
        );

      if (invalidEmployee) {
        return NextResponse.json(
          {
            error:
              invalidEmployee.parent_id &&
              invalidEmployee.parent_id !==
                currentManager.id
                ? `${invalidEmployee.username} đang thuộc Manager khác.`
                : `${invalidEmployee.username} không phải USER đang hoạt động.`,
          },
          {
            status: 409,
          }
        );
      }
    }

    const {
      data: currentEmployees,
      error:
        currentEmployeesError,
    } = await supabaseServer
      .from("users")
      .select("id")
      .eq(
        "role",
        "USER"
      )
      .eq(
        "parent_id",
        currentManager.id
      );

    if (
      currentEmployeesError
    ) {
      console.error(
        "MANAGER_EMPLOYEES_CURRENT_LIST_ERROR:",
        currentEmployeesError
      );

      return NextResponse.json(
        {
          error:
            "Không thể tải nhân viên hiện tại.",
        },
        {
          status: 500,
        }
      );
    }

    const selectedSet =
      new Set(
        selectedUserIds
      );

    const toRelease =
      (
        currentEmployees ??
        []
      )
        .map(
          (item) => item.id
        )
        .filter(
          (id) =>
            !selectedSet.has(id)
        );

    if (
      selectedUserIds.length > 0
    ) {
      const {
        data: claimed,
        error: claimError,
      } = await supabaseServer
        .from("users")
        .update({
          parent_id:
            currentManager.id,
          updated_at:
            new Date().toISOString(),
        })
        .in(
          "id",
          selectedUserIds
        )
        .eq(
          "role",
          "USER"
        )
        .eq(
          "active",
          true
        )
        .or(
          `parent_id.is.null,parent_id.eq.${currentManager.id}`
        )
        .select("id");

      if (claimError) {
        console.error(
          "MANAGER_EMPLOYEES_CLAIM_ERROR:",
          claimError
        );

        return NextResponse.json(
          {
            error:
              "Không thể thêm nhân viên vào phạm vi quản lý.",
          },
          {
            status: 500,
          }
        );
      }

      if (
        (
          claimed ?? []
        ).length !==
        selectedUserIds.length
      ) {
        return NextResponse.json(
          {
            error:
              "Danh sách nhân viên vừa thay đổi. Hãy mở lại Quản lý nhân viên rồi thử lại.",
          },
          {
            status: 409,
          }
        );
      }
    }

    if (
      toRelease.length > 0
    ) {
      const {
        error: releaseError,
      } = await supabaseServer
        .from("users")
        .update({
          parent_id: null,
          updated_at:
            new Date().toISOString(),
        })
        .in(
          "id",
          toRelease
        )
        .eq(
          "role",
          "USER"
        )
        .eq(
          "parent_id",
          currentManager.id
        );

      if (releaseError) {
        console.error(
          "MANAGER_EMPLOYEES_RELEASE_ERROR:",
          releaseError
        );

        return NextResponse.json(
          {
            error:
              "Đã thêm nhân viên nhưng không thể gỡ một số nhân viên cũ. Hãy tải lại danh sách.",
          },
          {
            status: 500,
          }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message:
        "Đã cập nhật nhân viên quản lý.",
      selectedCount:
        selectedUserIds.length,
      releasedCount:
        toRelease.length,
    });
  } catch (error) {
    console.error(
      "MANAGER_EMPLOYEES_PATCH_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi cập nhật nhân viên.",
      },
      {
        status: 500,
      }
    );
  }
}
