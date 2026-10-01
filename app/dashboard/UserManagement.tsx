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
    <div>
      {/* STATUS */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "13px",
              color:
                "var(--text-secondary)",
            }}
          >
            Quản trị người dùng
          </div>

          {currentUser && (
            <div
              style={{
                marginTop: "3px",
                fontWeight: 800,
              }}
            >
              Quyền hiện tại:{" "}
              <span
                style={{
                  color:
                    "var(--kk-red)",
                }}
              >
                {currentUser.role}
              </span>
            </div>
          )}
        </div>

        <div
          style={{
            padding:
              "6px 10px",
            borderRadius:
              "999px",
            background:
              "var(--kk-red-soft)",
            color:
              "var(--kk-red)",
            fontWeight: 800,
            fontSize: "12px",
          }}
        >
          {users.length} TÀI KHOẢN
        </div>
      </div>


      {/* MESSAGES */}

      {loading && (
        <div
          style={{
            marginBottom: "14px",
            color:
              "var(--text-secondary)",
          }}
        >
          Đang tải tài khoản...
        </div>
      )}


      {error && (
        <div
          style={{
            marginBottom: "14px",
            padding:
              "10px 12px",
            border:
              "1px solid #f1b5b5",
            borderRadius:
              "8px",
            background:
              "var(--danger-soft)",
            color:
              "var(--danger)",
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}


      {success && (
        <div
          style={{
            marginBottom: "14px",
            padding:
              "10px 12px",
            border:
              "1px solid #acd7ba",
            borderRadius:
              "8px",
            background:
              "var(--success-soft)",
            color:
              "var(--success)",
            fontWeight: 700,
          }}
        >
          {success}
        </div>
      )}


      {/* =================================================
          CREATE USER
      ================================================= */}

      {canCreateUsers && (
        <section
          style={{
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent:
                "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <div>
              <h2
                style={{
                  margin:
                    "0 0 4px",
                  fontSize:
                    "20px",
                }}
              >
                Thêm tài khoản
              </h2>

              <p
                style={{
                  margin: 0,
                  color:
                    "var(--text-secondary)",
                }}
              >
                Tạo tài khoản mới và
                phân quyền ngay khi
                thêm.
              </p>
            </div>
          </div>


          <form
            onSubmit={
              handleCreateUser
            }
          >
            {/* ROW 1 */}

            <div
              style={{
                display: "grid",

                gridTemplateColumns:
                  "repeat(4, minmax(180px, 1fr))",

                gap: "14px",
              }}
            >
              <div>
                <label
                  htmlFor="new-username"
                  style={{
                    display:
                      "block",
                    marginBottom:
                      "6px",
                    fontWeight:
                      700,
                  }}
                >
                  Username
                </label>

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
                  autoComplete="off"
                  style={{
                    width: "100%",
                  }}
                />
              </div>


              <div>
                <label
                  htmlFor="new-display-name"
                  style={{
                    display:
                      "block",
                    marginBottom:
                      "6px",
                    fontWeight:
                      700,
                  }}
                >
                  Tên hiển thị
                </label>

                <input
                  id="new-display-name"
                  type="text"
                  value={
                    displayName
                  }
                  onChange={(event) =>
                    setDisplayName(
                      event.target.value
                    )
                  }
                  disabled={creating}
                  style={{
                    width: "100%",
                  }}
                />
              </div>


              <div>
                <label
                  htmlFor="new-email"
                  style={{
                    display:
                      "block",
                    marginBottom:
                      "6px",
                    fontWeight:
                      700,
                  }}
                >
                  Email
                </label>

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
                  autoComplete="off"
                  style={{
                    width: "100%",
                  }}
                />
              </div>


              <div>
                <label
                  htmlFor="new-password"
                  style={{
                    display:
                      "block",
                    marginBottom:
                      "6px",
                    fontWeight:
                      700,
                  }}
                >
                  Mật khẩu ban đầu
                </label>

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
                  style={{
                    width: "100%",
                  }}
                />
              </div>
            </div>


            {/* ROW 2 */}

            <div
              style={{
                display: "grid",

                gridTemplateColumns:
                  role === "USER"
                    ? "minmax(150px, 0.7fr) minmax(240px, 1.2fr) minmax(140px, 0.6fr) auto"
                    : "minmax(150px, 0.7fr) minmax(140px, 0.6fr) auto",

                gap: "14px",
                alignItems: "end",
                marginTop: "14px",
              }}
            >
              <div>
                <label
                  htmlFor="new-role"
                  style={{
                    display:
                      "block",
                    marginBottom:
                      "6px",
                    fontWeight:
                      700,
                  }}
                >
                  Role
                </label>

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
                  style={{
                    width: "100%",
                  }}
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


              {role === "USER" && (
                <div>
                  <label
                    htmlFor="new-parent"
                    style={{
                      display:
                        "block",
                      marginBottom:
                        "6px",
                      fontWeight:
                        700,
                    }}
                  >
                    Manager
                  </label>

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
                    style={{
                      width: "100%",
                    }}
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
              )}


              <div
                style={{
                  minHeight: "40px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <label
                  style={{
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    gap: "8px",
                    fontWeight:
                      700,
                    cursor:
                      "pointer",
                  }}
                >
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

                  Active
                </label>
              </div>


              <button
                type="submit"
                className="kk-button-primary"
                disabled={creating}
                style={{
                  minHeight:
                    "40px",
                  minWidth:
                    "150px",
                  whiteSpace:
                    "nowrap",
                }}
              >
                {creating
                  ? "Đang tạo..."
                  : "Tạo tài khoản"}
              </button>
            </div>
          </form>
        </section>
      )}


      {/* =================================================
          USERS TABLE
      ================================================= */}

      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent:
              "space-between",
            gap: "12px",
            flexWrap: "wrap",
            marginBottom: "14px",
          }}
        >
          <div>
            <h2
              style={{
                margin:
                  "0 0 4px",
                fontSize:
                  "20px",
              }}
            >
              Danh sách tài khoản
            </h2>

            <p
              style={{
                margin: 0,
                color:
                  "var(--text-secondary)",
              }}
            >
              Tổng tài khoản:{" "}
              <strong>
                {users.length}
              </strong>
            </p>
          </div>
        </div>


        <div
          style={{
            overflowX: "auto",
            width: "100%",
          }}
        >
          <table
            style={{
              minWidth:
                "1100px",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign:
                      "left",
                    minWidth:
                      "130px",
                  }}
                >
                  Username
                </th>

                <th
                  style={{
                    textAlign:
                      "left",
                    minWidth:
                      "170px",
                  }}
                >
                  Tên hiển thị
                </th>

                <th
                  style={{
                    textAlign:
                      "left",
                    minWidth:
                      "240px",
                  }}
                >
                  Email
                </th>

                <th
                  style={{
                    minWidth:
                      "100px",
                  }}
                >
                  Role
                </th>

                <th
                  style={{
                    textAlign:
                      "left",
                    minWidth:
                      "150px",
                  }}
                >
                  Manager
                </th>

                <th
                  style={{
                    minWidth:
                      "130px",
                  }}
                >
                  Active
                </th>

                <th
                  style={{
                    minWidth:
                      "100px",
                  }}
                >
                  Auth
                </th>

                <th
                  style={{
                    minWidth:
                      "220px",
                  }}
                >
                  Thao tác
                </th>
              </tr>
            </thead>


            <tbody>
              {!loading &&
              users.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign:
                        "center",
                      padding:
                        "24px",
                      color:
                        "var(--text-secondary)",
                    }}
                  >
                    Không có tài khoản.
                  </td>
                </tr>
              ) : (
                users.map(
                  (user) => (
                    <tr
                      key={user.id}
                    >
                      <td
                        style={{
                          fontWeight:
                            800,
                        }}
                      >
                        {
                          user.username
                        }
                      </td>


                      <td>
                        {user.displayName ||
                          "-"}
                      </td>


                      <td
                        style={{
                          minWidth:
                            "240px",
                          overflowWrap:
                            "anywhere",
                        }}
                      >
                        {getPrimaryEmail(
                          user
                        )}
                      </td>


                      <td
                        style={{
                          textAlign:
                            "center",
                        }}
                      >
                        <span
                          style={{
                            display:
                              "inline-flex",

                            padding:
                              "4px 8px",

                            borderRadius:
                              "999px",

                            fontSize:
                              "12px",

                            fontWeight:
                              800,

                            background:
                              user.role ===
                              "ADMIN"
                                ? "var(--kk-red-soft)"
                                : user.role ===
                                  "MANAGER"
                                ? "var(--info-soft)"
                                : "var(--surface-soft)",

                            color:
                              user.role ===
                              "ADMIN"
                                ? "var(--kk-red)"
                                : user.role ===
                                  "MANAGER"
                                ? "var(--info)"
                                : "var(--foreground)",
                          }}
                        >
                          {user.role}
                        </span>
                      </td>


                      <td>
                        {user.parent
                          ? user.parent
                              .display_name ||
                            user.parent
                              .username
                          : "-"}
                      </td>


                      <td
                        style={{
                          textAlign:
                            "center",
                        }}
                      >
                        <span
                          className={
                            user.active
                              ? "kk-badge kk-badge-normal"
                              : "kk-badge kk-badge-error"
                          }
                        >
                          {user.active
                            ? "Đang hoạt động"
                            : "Đã khóa"}
                        </span>
                      </td>


                      <td
                        style={{
                          textAlign:
                            "center",
                        }}
                      >
                        {
                          user.authMode
                        }
                      </td>


                      <td
                        style={{
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {currentUser && (
                          <UserActions
                            user={user}
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
    </div>
  );
}
