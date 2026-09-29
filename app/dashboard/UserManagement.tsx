"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import UserActions from "./UserActions";

type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "USER";

type UserEmail = {
  id: string;
  email: string;
  active: boolean;
  isPrimary: boolean;
};

type ParentUser = {
  username: string;
  display_name: string | null;
};

type UserItem = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  active: boolean;
  authMode: "FIXED" | "GOOGLE";
  parentId: string | null;
  parent: ParentUser | null;
  emails: UserEmail[];
  createdAt: string;
  updatedAt: string;
};

type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
};

type UsersResponse = {
  success: boolean;

  currentUser: CurrentUser;

  canCreateUsers: boolean;

  users: UserItem[];
};

export default function UserManagement() {
  // ====================================================
  // DATA
  // ====================================================

  const [users, setUsers] =
    useState<UserItem[]>([]);

  const [
    currentUser,
    setCurrentUser,
  ] = useState<CurrentUser | null>(
    null
  );

  const [
    canCreateUsers,
    setCanCreateUsers,
  ] = useState(false);

  // ====================================================
  // UI
  // ====================================================

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  // ====================================================
  // CREATE USER FORM
  // ====================================================

  const [username, setUsername] =
    useState("");

  const [
    displayName,
    setDisplayName,
  ] = useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [role, setRole] =
    useState<UserRole>("USER");

  const [
    parentUsername,
    setParentUsername,
  ] = useState("");

  const [active, setActive] =
    useState(true);

  const [
    creating,
    setCreating,
  ] = useState(false);

  // ====================================================
  // LOAD USERS
  // ====================================================

  const loadUsers =
    useCallback(async () => {
      try {
        setLoading(true);
        setError("");

        const response =
          await fetch(
            "/api/users",
            {
              cache:
                "no-store",
            }
          );

        const data =
          (await response.json()) as
            | UsersResponse
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in data &&
              data.error
              ? data.error
              : "Không thể tải danh sách tài khoản."
          );
        }

        const result =
          data as UsersResponse;

        setUsers(
          result.users ?? []
        );

        setCurrentUser(
          result.currentUser
        );

        setCanCreateUsers(
          result.canCreateUsers
        );
      } catch (err) {
        console.error(
          "LOAD_USERS_ERROR:",
          err
        );

        setUsers([]);
        setCurrentUser(null);

        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách tài khoản."
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ====================================================
  // ACTIVE MANAGERS
  // ====================================================

  const managers =
    users
      .filter(
        (user) =>
          user.role ===
            "MANAGER" &&
          user.active
      )
      .map((manager) => ({
        id:
          manager.id,

        username:
          manager.username,

        displayName:
          manager.displayName,
      }));

  // ====================================================
  // PRIMARY EMAIL
  // ====================================================

  function getPrimaryEmail(
    user: UserItem
  ): string {
    const primary =
      user.emails.find(
        (item) =>
          item.isPrimary &&
          item.active
      );

    if (primary) {
      return primary.email;
    }

    const firstActive =
      user.emails.find(
        (item) =>
          item.active
      );

    return (
      firstActive?.email ?? "-"
    );
  }

  // ====================================================
  // CREATE USER
  // ====================================================

  async function handleCreateUser(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!username.trim()) {
      setError(
        "Vui lòng nhập Username."
      );

      return;
    }

    if (!email.trim()) {
      setError(
        "Vui lòng nhập Email."
      );

      return;
    }

    if (
      password.length < 8
    ) {
      setError(
        "Mật khẩu phải có ít nhất 8 ký tự."
      );

      return;
    }

    try {
      setCreating(true);

      const response =
        await fetch(
          "/api/users",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                username:
                  username.trim(),

                displayName:
                  displayName.trim() ||
                  null,

                email:
                  email.trim(),

                password,

                role,

                parentUsername:
                  role === "USER" &&
                  parentUsername
                    ? parentUsername
                    : null,

                active,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể tạo tài khoản."
        );
      }

      setSuccess(
        data.message ||
          "Tạo tài khoản thành công."
      );

      setUsername("");
      setDisplayName("");
      setEmail("");
      setPassword("");
      setRole("USER");
      setParentUsername("");
      setActive(true);

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tạo tài khoản."
      );
    } finally {
      setCreating(false);
    }
  }

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <section>
      <h2>
        Quản lý tài khoản
      </h2>

      {currentUser && (
        <p>
          Quyền hiện tại:{" "}
          <strong>
            {currentUser.role}
          </strong>
        </p>
      )}

      {loading && (
        <p>
          Đang tải tài khoản...
        </p>
      )}

      {error && (
        <p>
          <strong>
            {error}
          </strong>
        </p>
      )}

      {success && (
        <p>
          <strong>
            {success}
          </strong>
        </p>
      )}

      {/* ============================================= */}
      {/* CREATE USER */}
      {/* ============================================= */}

      {canCreateUsers && (
        <>
          <h3>
            Thêm tài khoản
          </h3>

          <form
            onSubmit={
              handleCreateUser
            }
          >
            <div>
              <label htmlFor="new-username">
                Username
              </label>

              <br />

              <input
                id="new-username"
                type="text"
                value={username}
                onChange={(event) =>
                  setUsername(
                    event.target.value
                  )
                }
                disabled={creating}
              />
            </div>

            <br />

            <div>
              <label htmlFor="new-display-name">
                Tên hiển thị
              </label>

              <br />

              <input
                id="new-display-name"
                type="text"
                value={displayName}
                onChange={(event) =>
                  setDisplayName(
                    event.target.value
                  )
                }
                disabled={creating}
              />
            </div>

            <br />

            <div>
              <label htmlFor="new-email">
                Email
              </label>

              <br />

              <input
                id="new-email"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                disabled={creating}
              />
            </div>

            <br />

            <div>
              <label htmlFor="new-password">
                Mật khẩu ban đầu
              </label>

              <br />

              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                minLength={8}
                autoComplete="new-password"
                disabled={creating}
              />
            </div>

            <br />

            <div>
              <label htmlFor="new-role">
                Role
              </label>

              <br />

              <select
                id="new-role"
                value={role}
                onChange={(event) => {
                  const nextRole =
                    event.target
                      .value as UserRole;

                  setRole(nextRole);

                  if (
                    nextRole !==
                    "USER"
                  ) {
                    setParentUsername(
                      ""
                    );
                  }
                }}
                disabled={creating}
              >
                <option value="USER">
                  USER
                </option>

                <option value="MANAGER">
                  MANAGER
                </option>

                <option value="ADMIN">
                  ADMIN
                </option>
              </select>
            </div>

            <br />

            {role === "USER" && (
              <>
                <div>
                  <label htmlFor="new-parent">
                    Manager
                  </label>

                  <br />

                  <select
                    id="new-parent"
                    value={
                      parentUsername
                    }
                    onChange={(
                      event
                    ) =>
                      setParentUsername(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      creating
                    }
                  >
                    <option value="">
                      Không gán Manager
                    </option>

                    {managers.map(
                      (manager) => (
                        <option
                          key={
                            manager.id
                          }
                          value={
                            manager.username
                          }
                        >
                          {manager.displayName
                            ? `${manager.displayName} (${manager.username})`
                            : manager.username}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <br />
              </>
            )}

            <div>
              <label>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(
                    event
                  ) =>
                    setActive(
                      event.target
                        .checked
                    )
                  }
                  disabled={
                    creating
                  }
                />

                {" "}
                Active
              </label>
            </div>

            <br />

            <button
              type="submit"
              disabled={creating}
            >
              {creating
                ? "Đang tạo..."
                : "Tạo tài khoản"}
            </button>
          </form>

          <hr />
        </>
      )}

      {/* ============================================= */}
      {/* USERS TABLE */}
      {/* ============================================= */}

      <h3>
        Danh sách tài khoản
      </h3>

      <p>
        Tổng tài khoản:{" "}
        <strong>
          {users.length}
        </strong>
      </p>

      <div
        style={{
          overflowX: "auto",
        }}
      >
        <table>
          <thead>
            <tr>
              <th>
                Username
              </th>

              <th>
                Tên hiển thị
              </th>

              <th>
                Email
              </th>

              <th>
                Role
              </th>

              <th>
                Manager
              </th>

              <th>
                Active
              </th>

              <th>
                Auth
              </th>

              <th>
                Thao tác
              </th>
            </tr>
          </thead>

          <tbody>
            {!loading &&
            users.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  Không có tài khoản.
                </td>
              </tr>
            ) : (
              users.map(
                (user) => (
                  <tr
                    key={
                      user.id
                    }
                  >
                    <td>
                      {
                        user.username
                      }
                    </td>

                    <td>
                      {user.displayName ||
                        "-"}
                    </td>

                    <td>
                      {getPrimaryEmail(
                        user
                      )}
                    </td>

                    <td>
                      <strong>
                        {
                          user.role
                        }
                      </strong>
                    </td>

                    <td>
                      {user.parent
                        ? user.parent
                            .display_name ||
                          user.parent
                            .username
                        : "-"}
                    </td>

                    <td>
                      {user.active
                        ? "Đang hoạt động"
                        : "Đã khóa"}
                    </td>

                    <td>
                      {
                        user.authMode
                      }
                    </td>

                    <td>
                      {currentUser && (
                        <UserActions
                          user={
                            user
                          }
                          currentUser={
                            currentUser
                          }
                          managers={
                            managers
                          }
                          onChanged={
                            loadUsers
                          }
                        />
                      )}
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}