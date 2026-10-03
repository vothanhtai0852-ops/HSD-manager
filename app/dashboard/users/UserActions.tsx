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
   * Sửa thông tin tài khoản + Gmail:
   * chỉ ADMIN.
   *
   * MANAGER chỉ gán/gỡ nhân viên bằng
   * màn hình Quản lý nhân viên.
   */
  const canEditAccount = isAdmin;

  /*
   * ADMIN reset được mật khẩu người khác.
   * Mỗi tài khoản đổi được mật khẩu chính mình.
   */
  const canChangePassword =
    isAdmin || isSelf;

  /*
   * Chỉ ADMIN được xóa tài khoản khác.
   * Không cho ADMIN tự xóa chính mình.
   */
  const canDeleteUser =
    isAdmin && !isSelf;

  const [editing, setEditing] =
    useState(false);

  const [
    changingPassword,
    setChangingPassword,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [
    deletingUser,
    setDeletingUser,
  ] = useState(false);

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

  // ====================================================
  // EMAIL MANAGEMENT
  // ====================================================

  const [
    newEmail,
    setNewEmail,
  ] = useState("");

  const [
    emailActionId,
    setEmailActionId,
  ] = useState<string | null>(
    null
  );

  const [
    editingEmailId,
    setEditingEmailId,
  ] = useState<string | null>(
    null
  );

  const [
    editingEmailValue,
    setEditingEmailValue,
  ] = useState("");

  // ====================================================
  // DELETE USER
  // ====================================================

  async function handleDeleteUser() {
    clearMessages();

    const confirmed =
      window.confirm(
        `Xóa tài khoản "${user.username}"?\n\n` +
        "Tài khoản chỉ được xóa hẳn nếu không còn dữ liệu HSD, lịch sử gửi cảnh báo hoặc dữ liệu ràng buộc. " +
        "Nếu đã có dữ liệu, hệ thống sẽ yêu cầu khóa tài khoản thay vì xóa."
      );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingUser(true);

      const response =
        await fetch(
          `/api/users/${user.id}`,
          {
            method: "DELETE",
          }
        );

      const data =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể xóa tài khoản."
        );
      }

      setEditing(false);
      setChangingPassword(false);

      setSuccess(
        data.message ||
          "Đã xóa tài khoản."
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xóa tài khoản."
      );
    } finally {
      setDeletingUser(false);
    }
  }

  // ====================================================
  // PASSWORD
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

    setNewEmail("");
    setEditingEmailId(null);
    setEditingEmailValue("");
    setEmailActionId(null);
  }

  function normalizeEmail(
    value: string
  ) {
    return value
      .trim()
      .toLowerCase();
  }

  function isValidEmail(
    value: string
  ) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
    );
  }

  async function readJson(
    response: Response
  ) {
    try {
      return await response.json();
    } catch {
      return {};
    }
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
        await readJson(response);

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

  // ====================================================
  // EMAIL ACTIONS
  // ====================================================

  async function handleAddEmail() {
    clearMessages();

    const email =
      normalizeEmail(newEmail);

    if (!email) {
      setError(
        "Vui lòng nhập Gmail cần thêm."
      );
      return;
    }

    if (!isValidEmail(email)) {
      setError(
        "Địa chỉ Gmail không hợp lệ."
      );
      return;
    }

    try {
      setEmailActionId("ADD");

      const response =
        await fetch(
          `/api/users/${user.id}/emails`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                email,
              }),
          }
        );

      const data =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể thêm Gmail."
        );
      }

      setNewEmail("");

      setSuccess(
        data.message ||
          "Đã thêm Gmail."
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể thêm Gmail."
      );
    } finally {
      setEmailActionId(null);
    }
  }

  function startEditEmail(
    email: UserEmail
  ) {
    clearMessages();

    setEditingEmailId(
      email.id
    );

    setEditingEmailValue(
      email.email
    );
  }

  async function saveEditedEmail(
    emailId: string
  ) {
    clearMessages();

    const email =
      normalizeEmail(
        editingEmailValue
      );

    if (!email) {
      setError(
        "Vui lòng nhập Gmail."
      );
      return;
    }

    if (!isValidEmail(email)) {
      setError(
        "Địa chỉ Gmail không hợp lệ."
      );
      return;
    }

    try {
      setEmailActionId(
        emailId
      );

      const response =
        await fetch(
          `/api/users/${user.id}/emails/${emailId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                email,
              }),
          }
        );

      const data =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể sửa Gmail."
        );
      }

      setEditingEmailId(null);
      setEditingEmailValue("");

      setSuccess(
        data.message ||
          "Đã sửa Gmail."
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể sửa Gmail."
      );
    } finally {
      setEmailActionId(null);
    }
  }

  async function setPrimaryEmail(
    emailId: string
  ) {
    clearMessages();

    try {
      setEmailActionId(
        emailId
      );

      const response =
        await fetch(
          `/api/users/${user.id}/emails/${emailId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                isPrimary: true,
              }),
          }
        );

      const data =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể đặt Gmail chính."
        );
      }

      setSuccess(
        data.message ||
          "Đã đặt Gmail chính."
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể đặt Gmail chính."
      );
    } finally {
      setEmailActionId(null);
    }
  }

  async function toggleEmailActive(
    email: UserEmail
  ) {
    clearMessages();

    try {
      setEmailActionId(
        email.id
      );

      const response =
        await fetch(
          `/api/users/${user.id}/emails/${email.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                active:
                  !email.active,
              }),
          }
        );

      const data =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể cập nhật trạng thái Gmail."
        );
      }

      setSuccess(
        data.message ||
          "Đã cập nhật Gmail."
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật trạng thái Gmail."
      );
    } finally {
      setEmailActionId(null);
    }
  }

  async function deleteEmail(
    email: UserEmail
  ) {
    clearMessages();

    const confirmed =
      window.confirm(
        `Xóa Gmail "${email.email}" khỏi ${user.username}?`
      );

    if (!confirmed) {
      return;
    }

    try {
      setEmailActionId(
        email.id
      );

      const response =
        await fetch(
          `/api/users/${user.id}/emails/${email.id}`,
          {
            method: "DELETE",
          }
        );

      const data =
        await readJson(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể xóa Gmail."
        );
      }

      if (
        editingEmailId ===
        email.id
      ) {
        setEditingEmailId(
          null
        );

        setEditingEmailValue(
          ""
        );
      }

      setSuccess(
        data.message ||
          "Đã xóa Gmail."
      );

      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xóa Gmail."
      );
    } finally {
      setEmailActionId(null);
    }
  }

  // ====================================================
  // PASSWORD
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
        await readJson(response);

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

              setCurrentPassword(
                ""
              );

              setNewPassword("");

              setConfirmPassword(
                ""
              );

              setChangingPassword(
                true
              );
            }}
            disabled={
              loading ||
              deletingUser
            }
          >
            {isSelf
              ? "Đổi mật khẩu"
              : "Reset mật khẩu"}
          </button>
        )}

        {canDeleteUser && (
          <button
            type="button"
            onClick={
              handleDeleteUser
            }
            disabled={
              loading ||
              deletingUser
            }
            style={{
              color:
                "var(--danger)",
              borderColor:
                "var(--danger)",
            }}
          >
            {deletingUser
              ? "Đang xóa..."
              : "Xóa User"}
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
              event.currentTarget &&
              !loading &&
              !emailActionId
            ) {
              setEditing(false);
            }
          }}
        >
          <div
            className="kk-modal user-edit-modal"
            style={{
              width:
                "min(860px, 100%)",
            }}
          >
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
                disabled={
                  loading ||
                  Boolean(
                    emailActionId
                  )
                }
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
                    value={
                      displayName
                    }
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

              <label
                className="active-checkbox"
                style={{
                  marginTop:
                    "16px",
                }}
              >
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

              {/* =========================================
                  GMAIL NHẬN CẢNH BÁO
              ========================================== */}

              <div
                style={{
                  marginTop: "22px",
                  paddingTop: "18px",
                  borderTop:
                    "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    marginBottom:
                      "12px",
                  }}
                >
                  <h3
                    style={{
                      margin:
                        "0 0 4px",
                    }}
                  >
                    Gmail nhận cảnh báo
                  </h3>

                  <div className="kk-muted">
                    Một User có thể có
                    nhiều Gmail. Tất cả
                    Gmail đang Active đều
                    nhận email cảnh báo.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {user.emails.length ===
                  0 ? (
                    <div
                      className="kk-muted"
                      style={{
                        padding:
                          "10px 0",
                      }}
                    >
                      Chưa có Gmail.
                    </div>
                  ) : (
                    user.emails.map(
                      (item) => {
                        const busy =
                          emailActionId ===
                          item.id;

                        const isEditing =
                          editingEmailId ===
                          item.id;

                        return (
                          <div
                            key={
                              item.id
                            }
                            style={{
                              display:
                                "grid",
                              gridTemplateColumns:
                                "minmax(0, 1fr) auto",
                              gap:
                                "10px",
                              alignItems:
                                "center",
                              padding:
                                "10px",
                              border:
                                "1px solid var(--border)",
                              borderRadius:
                                "9px",
                              background:
                                "var(--surface-soft)",
                            }}
                          >
                            <div
                              style={{
                                minWidth:
                                  0,
                              }}
                            >
                              {isEditing ? (
                                <input
                                  type="email"
                                  value={
                                    editingEmailValue
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setEditingEmailValue(
                                      event
                                        .target
                                        .value
                                    )
                                  }
                                  disabled={
                                    busy
                                  }
                                  style={{
                                    width:
                                      "100%",
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    overflowWrap:
                                      "anywhere",
                                    fontWeight:
                                      700,
                                  }}
                                >
                                  {
                                    item.email
                                  }
                                </div>
                              )}

                              <div
                                style={{
                                  display:
                                    "flex",
                                  gap:
                                    "6px",
                                  flexWrap:
                                    "wrap",
                                  marginTop:
                                    "5px",
                                  fontSize:
                                    "12px",
                                }}
                              >
                                {item.isPrimary && (
                                  <span
                                    className="kk-badge kk-badge-warning"
                                  >
                                    Gmail chính
                                  </span>
                                )}

                                <span
                                  className={
                                    item.active
                                      ? "kk-badge kk-badge-normal"
                                      : "kk-badge kk-badge-error"
                                  }
                                >
                                  {item.active
                                    ? "Active"
                                    : "Tắt"}
                                </span>
                              </div>
                            </div>

                            <div
                              style={{
                                display:
                                  "flex",
                                gap:
                                  "6px",
                                flexWrap:
                                  "wrap",
                                justifyContent:
                                  "flex-end",
                              }}
                            >
                              {isEditing ? (
                                <>
                                  <button
                                    type="button"
                                    className="kk-button-primary"
                                    onClick={() =>
                                      saveEditedEmail(
                                        item.id
                                      )
                                    }
                                    disabled={
                                      busy
                                    }
                                  >
                                    Lưu Gmail
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingEmailId(
                                        null
                                      );

                                      setEditingEmailValue(
                                        ""
                                      );
                                    }}
                                    disabled={
                                      busy
                                    }
                                  >
                                    Hủy
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditEmail(
                                        item
                                      )
                                    }
                                    disabled={
                                      busy
                                    }
                                  >
                                    Sửa Gmail
                                  </button>

                                  {!item.isPrimary && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPrimaryEmail(
                                          item.id
                                        )
                                      }
                                      disabled={
                                        busy ||
                                        !item.active
                                      }
                                    >
                                      Đặt chính
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleEmailActive(
                                        item
                                      )
                                    }
                                    disabled={
                                      busy
                                    }
                                  >
                                    {item.active
                                      ? "Tắt"
                                      : "Bật"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteEmail(
                                        item
                                      )
                                    }
                                    disabled={
                                      busy
                                    }
                                    style={{
                                      color:
                                        "var(--danger)",
                                    }}
                                  >
                                    Xóa
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )
                  )}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(0, 1fr) auto",
                    gap: "8px",
                    marginTop:
                      "10px",
                  }}
                >
                  <input
                    type="email"
                    placeholder="Thêm Gmail mới..."
                    value={newEmail}
                    onChange={(event) =>
                      setNewEmail(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      emailActionId ===
                      "ADD"
                    }
                  />

                  <button
                    type="button"
                    className="kk-button-primary"
                    onClick={
                      handleAddEmail
                    }
                    disabled={
                      emailActionId ===
                      "ADD"
                    }
                  >
                    {emailActionId ===
                    "ADD"
                      ? "Đang thêm..."
                      : "Thêm Gmail"}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="form-error"
                  style={{
                    marginTop:
                      "14px",
                  }}
                >
                  {error}
                </div>
              )}

              {success && (
                <div
                  className="status-message status-success"
                  style={{
                    marginTop:
                      "14px",
                    marginBottom:
                      0,
                  }}
                >
                  {success}
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
                  disabled={
                    loading ||
                    Boolean(
                      emailActionId
                    )
                  }
                >
                  Đóng
                </button>

                <button
                  type="submit"
                  className="kk-button-primary"
                  disabled={
                    loading ||
                    Boolean(
                      emailActionId
                    )
                  }
                >
                  {loading
                    ? "Đang lưu..."
                    : "Lưu thông tin"}
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
