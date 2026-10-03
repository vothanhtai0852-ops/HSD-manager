"use client";

import {
  useCallback,
  useEffect,
  useMemo,
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

type ThemeMode =
  | "light"
  | "dark";

type ManagerEmployeeItem = {
  id: string;
  username: string;
  displayName: string | null;
  active: boolean;
  parentId: string | null;
  parentUsername: string | null;
  parentDisplayName: string | null;
};

type ManagerEmployeesResponse = {
  success: boolean;
  currentManager: {
    id: string;
    username: string;
  };
  employees: ManagerEmployeeItem[];
};

export default function UserManagement() {
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

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [theme, setTheme] =
    useState<ThemeMode>("light");

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

  const [creating, setCreating] =
    useState(false);

  const [
    managerModalOpen,
    setManagerModalOpen,
  ] = useState(false);

  const [
    managerEmployees,
    setManagerEmployees,
  ] = useState<
    ManagerEmployeeItem[]
  >([]);

  const [
    selectedEmployeeIds,
    setSelectedEmployeeIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    employeeSearch,
    setEmployeeSearch,
  ] = useState("");

  const [
    employeeLoading,
    setEmployeeLoading,
  ] = useState(false);

  const [
    employeeSaving,
    setEmployeeSaving,
  ] = useState(false);

  const [
    employeeError,
    setEmployeeError,
  ] = useState("");

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          "hsd-theme"
        );

      const nextTheme:
        ThemeMode =
        saved === "dark"
          ? "dark"
          : "light";

      setTheme(nextTheme);

      document.documentElement.dataset.theme =
        nextTheme;
    } catch {
      document.documentElement.dataset.theme =
        "light";
    }
  }, []);

  function toggleTheme() {
    const nextTheme:
      ThemeMode =
      theme === "dark"
        ? "light"
        : "dark";

    setTheme(nextTheme);

    document.documentElement.dataset.theme =
      nextTheme;

    try {
      localStorage.setItem(
        "hsd-theme",
        nextTheme
      );
    } catch {
      // Không chặn UI nếu trình duyệt chặn localStorage.
    }
  }

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

  const managers =
    useMemo(
      () =>
        users
          .filter(
            (user) =>
              user.role ===
                "MANAGER" &&
              user.active
          )
          .map(
            (manager) => ({
              id: manager.id,
              username:
                manager.username,
              displayName:
                manager.displayName,
            })
          ),
      [users]
    );

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
        (item) => item.active
      );

    return (
      firstActive?.email ?? "-"
    );
  }

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

    if (password.length < 8) {
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

  async function openManagerEmployees() {
    if (
      currentUser?.role !==
      "MANAGER"
    ) {
      return;
    }

    setManagerModalOpen(true);
    setEmployeeSearch("");
    setEmployeeError("");
    setEmployeeLoading(true);

    try {
      const response =
        await fetch(
          "/api/users/manager-employees",
          {
            cache:
              "no-store",
          }
        );

      const data =
        (await response.json()) as
          | ManagerEmployeesResponse
          | {
              error?: string;
            };

      if (!response.ok) {
        throw new Error(
          "error" in data &&
            data.error
            ? data.error
            : "Không thể tải danh sách nhân viên."
        );
      }

      const result =
        data as ManagerEmployeesResponse;

      setManagerEmployees(
        result.employees ?? []
      );

      setSelectedEmployeeIds(
        new Set(
          (
            result.employees ??
            []
          )
            .filter(
              (item) =>
                item.parentId ===
                currentUser.id
            )
            .map(
              (item) =>
                item.id
            )
        )
      );
    } catch (err) {
      setManagerEmployees([]);
      setSelectedEmployeeIds(
        new Set()
      );

      setEmployeeError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách nhân viên."
      );
    } finally {
      setEmployeeLoading(false);
    }
  }

  function toggleEmployee(
    employee:
      ManagerEmployeeItem
  ) {
    if (!currentUser) {
      return;
    }

    const lockedByOtherManager =
      Boolean(
        employee.parentId &&
          employee.parentId !==
            currentUser.id
      );

    if (
      lockedByOtherManager ||
      !employee.active
    ) {
      return;
    }

    setSelectedEmployeeIds(
      (previous) => {
        const next =
          new Set(previous);

        if (
          next.has(employee.id)
        ) {
          next.delete(
            employee.id
          );
        } else {
          next.add(
            employee.id
          );
        }

        return next;
      }
    );
  }

  async function saveManagerEmployees() {
    if (
      currentUser?.role !==
      "MANAGER"
    ) {
      return;
    }

    setEmployeeError("");
    setEmployeeSaving(true);

    try {
      const response =
        await fetch(
          "/api/users/manager-employees",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                selectedUserIds:
                  Array.from(
                    selectedEmployeeIds
                  ),
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể lưu danh sách nhân viên."
        );
      }

      setManagerModalOpen(false);

      setSuccess(
        data.message ||
          "Đã cập nhật nhân viên quản lý."
      );

      await loadUsers();
    } catch (err) {
      setEmployeeError(
        err instanceof Error
          ? err.message
          : "Không thể lưu danh sách nhân viên."
      );
    } finally {
      setEmployeeSaving(false);
    }
  }

  const filteredManagerEmployees =
    useMemo(() => {
      const keyword =
        employeeSearch
          .trim()
          .toLowerCase();

      if (!keyword) {
        return managerEmployees;
      }

      return managerEmployees.filter(
        (employee) =>
          employee.username
            .toLowerCase()
            .includes(keyword) ||
          (
            employee.displayName ??
            ""
          )
            .toLowerCase()
            .includes(keyword) ||
          (
            employee.parentUsername ??
            ""
          )
            .toLowerCase()
            .includes(keyword)
      );
    }, [
      managerEmployees,
      employeeSearch,
    ]);

  return (
    <div className="user-management">
      <div className="user-management-toolbar">
        <div>
          <div className="kk-muted user-management-eyebrow">
            Quản trị người dùng
          </div>

          {currentUser && (
            <div className="current-role">
              Quyền hiện tại:{" "}
              <span>
                {currentUser.role}
              </span>
            </div>
          )}
        </div>

        <div className="user-management-toolbar-actions">
          {currentUser?.role ===
            "MANAGER" && (
            <button
              type="button"
              onClick={
                openManagerEmployees
              }
              className="manager-employees-button"
            >
              Quản lý nhân viên
            </button>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label="Đổi giao diện sáng tối"
          >
            {theme === "dark"
              ? "☀ Sáng"
              : "☾ Tối"}
          </button>

          <div className="account-count">
            {users.length} TÀI KHOẢN
          </div>
        </div>
      </div>

      {loading && (
        <div className="status-message">
          Đang tải tài khoản...
        </div>
      )}

      {error && (
        <div className="status-message status-error">
          {error}
        </div>
      )}

      {success && (
        <div className="status-message status-success">
          {success}
        </div>
      )}

      {canCreateUsers && (
        <section className="create-user-section">
          <div className="section-heading">
            <div>
              <h2>
                Thêm tài khoản
              </h2>
              <p className="kk-muted">
                Tạo tài khoản mới và
                phân quyền ngay khi thêm.
              </p>
            </div>
          </div>

          <form
            onSubmit={
              handleCreateUser
            }
          >
            <div className="user-create-grid">
              <div>
                <label
                  htmlFor="new-username"
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
                />
              </div>

              <div>
                <label
                  htmlFor="new-display-name"
                >
                  Tên hiển thị
                </label>
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

              <div>
                <label
                  htmlFor="new-email"
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
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
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
                />
              </div>
            </div>

            <div className="user-create-footer-grid">
              <div>
                <label
                  htmlFor="new-role"
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
                  >
                    Manager
                  </label>
                  <select
                    id="new-parent"
                    value={
                      parentUsername
                    }
                    onChange={(event) =>
                      setParentUsername(
                        event.target
                          .value
                      )
                    }
                    disabled={creating}
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

              <label className="active-checkbox create-active">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) =>
                    setActive(
                      event.target
                        .checked
                    )
                  }
                  disabled={creating}
                />
                Active
              </label>

              <button
                type="submit"
                className="kk-button-primary create-user-button"
                disabled={creating}
              >
                {creating
                  ? "Đang tạo..."
                  : "Tạo tài khoản"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section>
        <div className="section-heading">
          <div>
            <h2>
              Danh sách tài khoản
            </h2>
            <p className="kk-muted">
              Tổng tài khoản:{" "}
              <strong>
                {users.length}
              </strong>
            </p>
          </div>
        </div>

        <div className="user-table-desktop">
          <div className="user-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Tên hiển thị</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Manager</th>
                  <th>Active</th>
                  <th>Auth</th>
                  <th>Thao tác</th>
                </tr>
              </thead>

              <tbody>
                {!loading &&
                users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="empty-cell"
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
                        <td className="username-cell">
                          {user.username}
                        </td>

                        <td>
                          {user.displayName ||
                            "-"}
                        </td>

                        <td className="email-cell">
                          {getPrimaryEmail(
                            user
                          )}
                        </td>

                        <td>
                          <span
                            className={`role-badge role-${user.role.toLowerCase()}`}
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

                        <td>
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

                        <td>
                          {user.authMode}
                        </td>

                        <td>
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
        </div>

        <div className="user-card-list">
          {!loading &&
          users.length === 0 ? (
            <div className="empty-card">
              Không có tài khoản.
            </div>
          ) : (
            users.map((user) => (
              <article
                className="user-card"
                key={user.id}
              >
                <div className="user-card-header">
                  <div>
                    <div className="user-card-username">
                      {user.username}
                    </div>
                    <div className="kk-muted">
                      {user.displayName ||
                        "Chưa có tên hiển thị"}
                    </div>
                  </div>

                  <span
                    className={`role-badge role-${user.role.toLowerCase()}`}
                  >
                    {user.role}
                  </span>
                </div>

                <div className="user-card-grid">
                  <div>
                    <span>Email</span>
                    <strong>
                      {getPrimaryEmail(
                        user
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Manager</span>
                    <strong>
                      {user.parent
                        ? user.parent
                            .display_name ||
                          user.parent
                            .username
                        : "-"}
                    </strong>
                  </div>

                  <div>
                    <span>Trạng thái</span>
                    <strong>
                      {user.active
                        ? "Đang hoạt động"
                        : "Đã khóa"}
                    </strong>
                  </div>

                  <div>
                    <span>Auth</span>
                    <strong>
                      {user.authMode}
                    </strong>
                  </div>
                </div>

                {currentUser && (
                  <div className="user-card-actions">
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
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </section>

      {managerModalOpen &&
        currentUser?.role ===
          "MANAGER" && (
          <div
            className="kk-modal-backdrop"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget &&
                !employeeSaving
              ) {
                setManagerModalOpen(
                  false
                );
              }
            }}
          >
            <div className="kk-modal manager-employees-modal">
              <div className="modal-heading">
                <div>
                  <h2>
                    Quản lý nhân viên
                  </h2>

                  <div className="kk-muted">
                    Tick USER chưa có
                    Manager để nhận quản
                    lý. Bỏ tick để gỡ
                    USER khỏi phạm vi của
                    bạn.
                  </div>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={() =>
                    setManagerModalOpen(
                      false
                    )
                  }
                  disabled={
                    employeeSaving
                  }
                  aria-label="Đóng"
                >
                  ×
                </button>
              </div>

              <div className="manager-employee-search">
                <input
                  type="search"
                  placeholder="Tìm username hoặc tên hiển thị..."
                  value={
                    employeeSearch
                  }
                  onChange={(event) =>
                    setEmployeeSearch(
                      event.target
                        .value
                    )
                  }
                  disabled={
                    employeeLoading ||
                    employeeSaving
                  }
                />
              </div>

              {employeeError && (
                <div className="status-message status-error">
                  {employeeError}
                </div>
              )}

              <div className="manager-employee-list">
                {employeeLoading ? (
                  <div className="manager-employee-loading">
                    Đang tải nhân viên...
                  </div>
                ) : (
                  filteredManagerEmployees.map(
                    (employee) => {
                      const checked =
                        selectedEmployeeIds.has(
                          employee.id
                        );

                      const lockedByOtherManager =
                        Boolean(
                          employee.parentId &&
                            employee.parentId !==
                              currentUser.id
                        );

                      const disabled =
                        employeeSaving ||
                        !employee.active ||
                        lockedByOtherManager;

                      const managerLabel =
                        lockedByOtherManager
                          ? `Đang thuộc ${
                              employee.parentDisplayName ||
                              employee.parentUsername ||
                              "Manager khác"
                            }`
                          : checked
                            ? "Nhân viên quầy"
                            : "Có thể chọn";

                      return (
                        <label
                          key={
                            employee.id
                          }
                          className={[
                            "manager-employee-row",
                            checked
                              ? "is-selected"
                              : "",
                            disabled
                              ? "is-disabled"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={
                              checked
                            }
                            disabled={
                              disabled
                            }
                            onChange={() =>
                              toggleEmployee(
                                employee
                              )
                            }
                          />

                          <span className="manager-employee-name">
                            <strong>
                              {
                                employee.username
                              }
                            </strong>

                            {employee.displayName && (
                              <small>
                                {
                                  employee.displayName
                                }
                              </small>
                            )}
                          </span>

                          <span className="manager-employee-status">
                            {
                              managerLabel
                            }
                          </span>
                        </label>
                      );
                    }
                  )
                )}

                {!employeeLoading &&
                  filteredManagerEmployees.length ===
                    0 && (
                    <div className="manager-employee-loading">
                      Không có USER phù hợp.
                    </div>
                  )}
              </div>

              <div className="manager-employees-footer">
                <div className="manager-selected-count">
                  Đã chọn:{" "}
                  <strong>
                    {
                      selectedEmployeeIds.size
                    }
                  </strong>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    onClick={() =>
                      setManagerModalOpen(
                        false
                      )
                    }
                    disabled={
                      employeeSaving
                    }
                  >
                    Hủy
                  </button>

                  <button
                    type="button"
                    className="kk-button-primary"
                    onClick={
                      saveManagerEmployees
                    }
                    disabled={
                      employeeSaving ||
                      employeeLoading
                    }
                  >
                    {employeeSaving
                      ? "Đang lưu..."
                      : "Lưu thay đổi"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
