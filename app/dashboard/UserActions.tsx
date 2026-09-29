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

type UserItem = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  active: boolean;
  parentId: string | null;

  parent: {
    username: string;
    display_name: string | null;
  } | null;
};

type Props = {
  user: UserItem;
  currentUser: CurrentUser;
  managers: ManagerItem[];
  onChanged: () => void;
};

export default function UserActions({
  user,
  currentUser,
  managers,
  onChanged,
}: Props) {
  // ====================================================
  // PERMISSIONS
  // ====================================================

  const isSelf =
    currentUser.id === user.id;

  const isAdmin =
    currentUser.role === "ADMIN";

  const isManager =
    currentUser.role === "MANAGER";

  const canEdit =
    isAdmin ||
    (
      isManager &&
      !isSelf &&
      user.role === "USER"
    );

  const canChangePassword =
    isSelf ||
    isAdmin ||
    (
      isManager &&
      !isSelf &&
      user.role === "USER"
    );

  // ====================================================
  // UI STATE
  // ====================================================

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

  // ====================================================
  // EDIT FORM
  // ====================================================

  const [
    displayName,
    setDisplayName,
  ] = useState(
    user.displayName ?? ""
  );

  const [role, setRole] =
    useState<UserRole>(
      user.role
    );

  const [active, setActive] =
    useState(
      user.active
    );

  const [
    parentUsername,
    setParentUsername,
  ] = useState(
    user.parent?.username ?? ""
  );

  // ====================================================
  // PASSWORD FORM
  // ====================================================

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

  // ====================================================
  // SYNC WHEN USER CHANGES
  // ====================================================

  useEffect(() => {
    setDisplayName(
      user.displayName ?? ""
    );

    setRole(user.role);

    setActive(user.active);

    setParentUsername(
      user.parent?.username ??
        ""
    );
  }, [user]);

  // ====================================================
  // RESET MESSAGES
  // ====================================================

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  // ====================================================
  // UPDATE USER
  // ====================================================

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    clearMessages();

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

            body:
              JSON.stringify({
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

      onChanged();
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

  // ====================================================
  // CHANGE / RESET PASSWORD
  // ====================================================

  async function handlePassword(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    clearMessages();

    if (
      newPassword.length < 8
    ) {
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

            body:
              JSON.stringify({
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

      setChangingPassword(
        false
      );
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

  // ====================================================
  // EDIT FORM
  // ====================================================

  if (editing) {
    return (
      <div>
        <form
          onSubmit={handleUpdate}
        >
          <div>
            <label>
              Tên hiển thị
            </label>

            <br />

            <input
              type="text"
              value={displayName}
              onChange={(event) =>
                setDisplayName(
                  event.target.value
                )
              }
              disabled={loading}
            />
          </div>

          <br />

          {isAdmin && (
            <>
              <div>
                <label>
                  Role
                </label>

                <br />

                <select
                  value={role}
                  disabled={
                    loading ||
                    (
                      isSelf &&
                      user.role ===
                        "ADMIN"
                    )
                  }
                  onChange={(
                    event
                  ) => {
                    const nextRole =
                      event.target
                        .value as UserRole;

                    setRole(
                      nextRole
                    );

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

              <br />
            </>
          )}

          {isAdmin &&
            role === "USER" && (
              <>
                <div>
                  <label>
                    Manager
                  </label>

                  <br />

                  <select
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
                      loading
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
                disabled={
                  loading ||
                  isSelf
                }
                onChange={(
                  event
                ) =>
                  setActive(
                    event.target
                      .checked
                  )
                }
              />

              {" "}
              Active
            </label>
          </div>

          <br />

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

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Đang lưu..."
              : "Lưu"}
          </button>

          {" "}

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              clearMessages();

              setDisplayName(
                user.displayName ??
                  ""
              );

              setRole(
                user.role
              );

              setActive(
                user.active
              );

              setParentUsername(
                user.parent
                  ?.username ??
                  ""
              );

              setEditing(
                false
              );
            }}
          >
            Hủy
          </button>
        </form>
      </div>
    );
  }

  // ====================================================
  // PASSWORD FORM
  // ====================================================

  if (changingPassword) {
    return (
      <div>
        <form
          onSubmit={
            handlePassword
          }
        >
          <p>
            <strong>
              {isSelf
                ? "Đổi mật khẩu"
                : `Reset mật khẩu: ${user.username}`}
            </strong>
          </p>

          {isSelf && (
            <>
              <div>
                <label>
                  Mật khẩu hiện tại
                </label>

                <br />

                <input
                  type="password"
                  value={
                    currentPassword
                  }
                  onChange={(
                    event
                  ) =>
                    setCurrentPassword(
                      event.target
                        .value
                    )
                  }
                  autoComplete="current-password"
                  disabled={
                    loading
                  }
                />
              </div>

              <br />
            </>
          )}

          <div>
            <label>
              Mật khẩu mới
            </label>

            <br />

            <input
              type="password"
              value={newPassword}
              onChange={(event) =>
                setNewPassword(
                  event.target.value
                )
              }
              minLength={8}
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <br />

          <div>
            <label>
              Xác nhận mật khẩu mới
            </label>

            <br />

            <input
              type="password"
              value={
                confirmPassword
              }
              onChange={(event) =>
                setConfirmPassword(
                  event.target.value
                )
              }
              minLength={8}
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <br />

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

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Đang cập nhật..."
              : isSelf
                ? "Đổi mật khẩu"
                : "Đặt lại mật khẩu"}
          </button>

          {" "}

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              clearMessages();

              setCurrentPassword(
                ""
              );

              setNewPassword(
                ""
              );

              setConfirmPassword(
                ""
              );

              setChangingPassword(
                false
              );
            }}
          >
            Hủy
          </button>
        </form>
      </div>
    );
  }

  // ====================================================
  // NORMAL VIEW
  // ====================================================

  return (
    <div>
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => {
              clearMessages();

              setEditing(true);
            }}
            disabled={loading}
          >
            Sửa
          </button>

          {" "}
        </>
      )}

      {canChangePassword && (
        <button
          type="button"
          onClick={() => {
            clearMessages();

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

      {success && (
        <div>
          <strong>
            {success}
          </strong>
        </div>
      )}

      {error && (
        <div>
          <strong>
            {error}
          </strong>
        </div>
      )}
    </div>
  );
}