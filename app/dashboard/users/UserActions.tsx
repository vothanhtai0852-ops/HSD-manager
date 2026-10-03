"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "USER";

type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
};

type ManagerItem = {
  id: string;
  username: string;
  displayName: string | null;
};

type UserEmail = {
  id: string;
  email: string;
  active: boolean;
  isPrimary: boolean;
};

type UserItem = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  active: boolean;
  authMode: "FIXED" | "GOOGLE";
  parentId: string | null;
  parent: {
    username: string;
    display_name: string | null;
  } | null;
  emails: UserEmail[];
};

type Props = {
  user: UserItem;
  currentUser: CurrentUser;
  managers: ManagerItem[];
  onChanged: () => void | Promise<void>;
};

export default function UserActions({
  user,
  currentUser,
  managers,
  onChanged,
}: Props) {
  const isSelf =
    currentUser.id === user.id;

  const isAdmin =
    currentUser.role === "ADMIN";

  /*
   * MANAGER không có quyền sửa tài khoản nhân viên.
   * MANAGER chỉ gán/gỡ nhân viên trong modal "Quản lý nhân viên".
   */
  const canEditAccount = isAdmin;

  /*
   * ADMIN reset được mật khẩu.
   * Mọi tài khoản đổi được mật khẩu của chính mình.
   */
  const canChangePassword =
    isAdmin || isSelf;

  const [editing, setEditing] =
    useState(false);

  const [
    changingPassword,
    setChangingPassword,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [
    username,
    setUsername,
  ] = useState(user.username);

  const [
    displayName,
    setDisplayName,
  ] = useState(
    user.displayName ?? ""
  );

  const [role, setRole] =
    useState<UserRole>(user.role);

  const [active, setActive] =
    useState(user.active);

  const [
    parentUsername,
    setParentUsername,
  ] = useState(
    user.parent?.username ?? ""
  );

  const [
    currentPassword,
    setCurrentPassword,
  ] = useState("");

  const [
    newPassword,
    setNewPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  useEffect(() => {
    setUsername(user.username);
    setDisplayName(
      user.displayName ?? ""
    );
    setRole(user.role);
    setActive(user.active);
    setParentUsername(
      user.parent?.username ?? ""
    );
  }, [user]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function resetEditForm() {
    setUsername(user.username);
    setDisplayName(
      user.displayName ?? ""
    );
    setRole(user.role);
    setActive(user.active);
    setParentUsername(
      user.parent?.username ?? ""
    );
  }

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    clearMessages();

    const normalizedUsername =
      username.trim();

    if (!normalizedUsername) {
      setError(
        "Vui lòng nhập Username."
      );
      return;
    }

    try {
      setLoading(true);

      const response =
        await fetch(
          `/api/users/${user.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              username:
                normalizedUsername,
              displayName:
                displayName.trim() ||
                null,
              role,
              active,
              parentUsername:
                role === "USER"
                  ? (
                      parentUsername ||
                      null
                    )
                  : null,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể cập nhật tài khoản."
        );
      }

      setSuccess(
        data.message ||
          "Cập nhật tài khoản thành công."
      );

      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật tài khoản."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    clearMessages();

    if (newPassword.length < 8) {
      setError(
        "Mật khẩu mới phải có ít nhất 8 ký tự."
      );
      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setError(
        "Xác nhận mật khẩu mới không khớp."
      );
      return;
    }

    if (
      isSelf &&
      !currentPassword
    ) {
      setError(
        "Vui lòng nhập mật khẩu hiện tại."
      );
      return;
    }

    try {
      setLoading(true);

      const response =
        await fetch(
          `/api/users/${user.id}/password`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              currentPassword:
                isSelf
                  ? currentPassword
                  : undefined,
              newPassword,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể cập nhật mật khẩu."
        );
      }

      setSuccess(
        data.message ||
          "Cập nhật mật khẩu thành công."
      );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setChangingPassword(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật mật khẩu."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="user-actions">
        {canEditAccount && (
          <button
            type="button"
            onClick={() => {
              clearMessages();
              resetEditForm();
              setEditing(true);
            }}
            disabled={loading}
          >
            Sửa
          </button>
        )}

        {canChangePassword && (
          <button
            type="button"
            onClick={() => {
              clearMessages();
              setCurrentPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setChangingPassword(
                true
              );
            }}
            disabled={loading}
          >
            {isSelf
              ? "Đổi mật khẩu"
              : "Reset mật khẩu"}
          </button>
        )}
      </div>

      {success && (
        <div className="user-action-success">
          {success}
        </div>
      )}

      {error && (
        <div className="user-action-error">
          {error}
        </div>
      )}

      {editing && (
        <div
          className="kk-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setEditing(false);
            }
          }}
        >
          <div className="kk-modal user-edit-modal">
            <div className="modal-heading">
              <div>
                <h2>
                  Sửa tài khoản
                </h2>
                <div className="kk-muted">
                  {user.username}
                </div>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setEditing(false)
                }
                disabled={loading}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleUpdate}
            >
              <div className="user-edit-grid">
                <div>
                  <label
                    htmlFor={`username-${user.id}`}
                  >
                    Username
                  </label>

                  <input
                    id={`username-${user.id}`}
                    type="text"
                    value={username}
                    onChange={(event) =>
                      setUsername(
                        event.target
                          .value
                      )
                    }
                    autoComplete="off"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`display-${user.id}`}
                  >
                    Tên hiển thị
                  </label>

                  <input
                    id={`display-${user.id}`}
                    type="text"
                    value={displayName}
                    onChange={(event) =>
                      setDisplayName(
                        event.target
                          .value
                      )
                    }
                    disabled={loading}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`role-${user.id}`}
                  >
                    Role
                  </label>

                  <select
                    id={`role-${user.id}`}
                    value={role}
                    disabled={
                      loading ||
                      (
                        isSelf &&
                        user.role ===
                          "ADMIN"
                      )
                    }
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
                      htmlFor={`manager-${user.id}`}
                    >
                      Manager
                    </label>

                    <select
                      id={`manager-${user.id}`}
                      value={
                        parentUsername
                      }
                      onChange={(event) =>
                        setParentUsername(
                          event.target
                            .value
                        )
                      }
                      disabled={loading}
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
              </div>

              <label className="active-checkbox">
                <input
                  type="checkbox"
                  checked={active}
                  disabled={
                    loading ||
                    isSelf
                  }
                  onChange={(event) =>
                    setActive(
                      event.target
                        .checked
                    )
                  }
                />
                Active
              </label>

              {error && (
                <div className="form-error">
                  {error}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    resetEditForm();
                    setEditing(false);
                    clearMessages();
                  }}
                  disabled={loading}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="kk-button-primary"
                  disabled={loading}
                >
                  {loading
                    ? "Đang lưu..."
                    : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {changingPassword && (
        <div
          className="kk-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setChangingPassword(
                false
              );
            }
          }}
        >
          <div className="kk-modal password-modal">
            <div className="modal-heading">
              <div>
                <h2>
                  {isSelf
                    ? "Đổi mật khẩu"
                    : "Reset mật khẩu"}
                </h2>
                <div className="kk-muted">
                  {user.username}
                </div>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setChangingPassword(
                    false
                  )
                }
                disabled={loading}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                handlePassword
              }
            >
              {isSelf && (
                <div className="form-field">
                  <label
                    htmlFor={`current-password-${user.id}`}
                  >
                    Mật khẩu hiện tại
                  </label>

                  <input
                    id={`current-password-${user.id}`}
                    type="password"
                    value={
                      currentPassword
                    }
                    onChange={(event) =>
                      setCurrentPassword(
                        event.target
                          .value
                      )
                    }
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </div>
              )}

              <div className="form-field">
                <label
                  htmlFor={`new-password-${user.id}`}
                >
                  Mật khẩu mới
                </label>

                <input
                  id={`new-password-${user.id}`}
                  type="password"
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(
                      event.target
                        .value
                    )
                  }
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              <div className="form-field">
                <label
                  htmlFor={`confirm-password-${user.id}`}
                >
                  Xác nhận mật khẩu mới
                </label>

                <input
                  id={`confirm-password-${user.id}`}
                  type="password"
                  value={
                    confirmPassword
                  }
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target
                        .value
                    )
                  }
                  minLength={8}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="form-error">
                  {error}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    clearMessages();
                    setChangingPassword(
                      false
                    );
                  }}
                  disabled={loading}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="kk-button-primary"
                  disabled={loading}
                >
                  {loading
                    ? "Đang cập nhật..."
                    : isSelf
                      ? "Đổi mật khẩu"
                      : "Đặt lại mật khẩu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
