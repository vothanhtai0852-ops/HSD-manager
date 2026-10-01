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


  const canManageEmails =
    isAdmin ||
    (
      isManager &&
      !isSelf &&
      user.role === "USER"
    );


  // ====================================================
  // UI STATE
  // ====================================================

  const [
    editing,
    setEditing,
  ] = useState(false);


  const [
    changingPassword,
    setChangingPassword,
  ] = useState(false);


  const [
    managingEmails,
    setManagingEmails,
  ] = useState(false);


  const [
    loading,
    setLoading,
  ] = useState(false);


  const [
    error,
    setError,
  ] = useState("");


  const [
    success,
    setSuccess,
  ] = useState("");


  // ====================================================
  // EMAIL STATE
  // ====================================================

  const [
    newEmail,
    setNewEmail,
  ] = useState("");


  const [
    emailActionId,
    setEmailActionId,
  ] = useState<
    string | null
  >(null);


  // ====================================================
  // EDIT FORM
  // ====================================================

  const [
    displayName,
    setDisplayName,
  ] = useState(
    user.displayName ?? ""
  );


  const [
    role,
    setRole,
  ] = useState<UserRole>(
    user.role
  );


  const [
    active,
    setActive,
  ] = useState(
    user.active
  );


  const [
    parentUsername,
    setParentUsername,
  ] = useState(
    user.parent?.username ??
      ""
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

    setRole(
      user.role
    );

    setActive(
      user.active
    );

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
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    clearMessages();


    try {
      setLoading(true);


      const response =
        await fetch(
          `/api/users/${user.id}`,
          {
            method:
              "PATCH",

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
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    clearMessages();


    if (
      newPassword.length <
      8
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
            method:
              "PATCH",

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
  // ADD EMAIL
  // ====================================================

  async function handleAddEmail(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    clearMessages();


    const emailValue =
      newEmail
        .trim()
        .toLowerCase();


    if (!emailValue) {
      setError(
        "Vui lòng nhập Gmail."
      );

      return;
    }


    try {
      setEmailActionId(
        "__new__"
      );


      const response =
        await fetch(
          `/api/users/${user.id}/emails`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email:
                  emailValue,
              }),
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể thêm Gmail."
        );
      }


      setNewEmail("");


      setSuccess(
        data.message ||
          "Thêm Gmail thành công."
      );


      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể thêm Gmail."
      );
    } finally {
      setEmailActionId(
        null
      );
    }
  }


  // ====================================================
  // TOGGLE EMAIL
  // ====================================================

  async function handleToggleEmail(
    item: UserEmail
  ) {
    clearMessages();


    try {
      setEmailActionId(
        item.id
      );


      const response =
        await fetch(
          `/api/users/${user.id}/emails/${item.id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                active:
                  !item.active,
              }),
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể cập nhật Gmail."
        );
      }


      setSuccess(
        data.message ||
          "Cập nhật Gmail thành công."
      );


      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật Gmail."
      );
    } finally {
      setEmailActionId(
        null
      );
    }
  }


  // ====================================================
  // DELETE EMAIL
  // ====================================================

  async function handleDeleteEmail(
    item: UserEmail
  ) {
    if (
      item.isPrimary
    ) {
      setError(
        "Không thể xóa Gmail chính."
      );

      return;
    }


    const confirmed =
      window.confirm(
        `Xóa Gmail "${item.email}" khỏi tài khoản ${user.username}?`
      );


    if (!confirmed) {
      return;
    }


    clearMessages();


    try {
      setEmailActionId(
        item.id
      );


      const response =
        await fetch(
          `/api/users/${user.id}/emails/${item.id}`,
          {
            method:
              "DELETE",
          }
        );


      const data =
        await response.json();


      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể xóa Gmail."
        );
      }


      setSuccess(
        data.message ||
          "Xóa Gmail thành công."
      );


      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xóa Gmail."
      );
    } finally {
      setEmailActionId(
        null
      );
    }
  }


  // ====================================================
  // EDIT FORM
  // ====================================================

  if (editing) {
    return (
      <div>
        <form
          onSubmit={
            handleUpdate
          }
        >
          <div>
            <label>
              Tên hiển thị
            </label>

            <br />

            <input
              type="text"
              value={
                displayName
              }
              onChange={(
                event
              ) =>
                setDisplayName(
                  event.target
                    .value
                )
              }
              disabled={
                loading
              }
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
                  value={
                    role
                  }
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
                      event
                        .target
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
            role ===
              "USER" && (
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
                        event
                          .target
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
                      (
                        manager
                      ) => (
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
                checked={
                  active
                }
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
            disabled={
              loading
            }
          >
            {loading
              ? "Đang lưu..."
              : "Lưu"}
          </button>


          {" "}


          <button
            type="button"
            disabled={
              loading
            }
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
                      event
                        .target
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
              value={
                newPassword
              }
              onChange={(
                event
              ) =>
                setNewPassword(
                  event.target
                    .value
                )
              }
              minLength={8}
              autoComplete="new-password"
              disabled={
                loading
              }
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
              onChange={(
                event
              ) =>
                setConfirmPassword(
                  event.target
                    .value
                )
              }
              minLength={8}
              autoComplete="new-password"
              disabled={
                loading
              }
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
            disabled={
              loading
            }
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
            disabled={
              loading
            }
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
    <>
      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "wrap",
        }}
      >
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              clearMessages();

              setEditing(
                true
              );
            }}
            disabled={
              loading ||
              emailActionId !==
                null
            }
          >
            Sửa
          </button>
        )}


        {canManageEmails && (
          <button
            type="button"
            onClick={() => {
              clearMessages();

              setNewEmail("");

              setManagingEmails(
                true
              );
            }}
            disabled={
              loading ||
              emailActionId !==
                null
            }
          >
            Gmail
          </button>
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
            disabled={
              loading ||
              emailActionId !==
                null
            }
          >
            {isSelf
              ? "Đổi mật khẩu"
              : "Reset mật khẩu"}
          </button>
        )}
      </div>


      {!managingEmails &&
        success && (
          <div>
            <strong>
              {success}
            </strong>
          </div>
        )}


      {!managingEmails &&
        error && (
          <div>
            <strong>
              {error}
            </strong>
          </div>
        )}


      {/* =================================================
          EMAIL MODAL
      ================================================== */}

      {managingEmails && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quản lý Gmail"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,

            display: "flex",
            alignItems: "center",
            justifyContent:
              "center",

            padding: "20px",

            background:
              "rgba(0, 0, 0, 0.65)",
          }}
        >
          <div
            style={{
              width:
                "min(700px, 100%)",

              maxHeight:
                "90vh",

              overflowY:
                "auto",

              boxSizing:
                "border-box",

              padding:
                "24px",

              border:
                "1px solid #666",

              borderRadius:
                "12px",

              background:
                "Canvas",

              color:
                "CanvasText",

              boxShadow:
                "0 20px 60px rgba(0,0,0,0.45)",
            }}
          >
            {/* HEADER */}

            <div
              style={{
                display: "flex",

                alignItems:
                  "flex-start",

                justifyContent:
                  "space-between",

                gap: "16px",

                marginBottom:
                  "20px",
              }}
            >
              <div>
                <h2
                  style={{
                    margin:
                      "0 0 6px",
                  }}
                >
                  Gmail nhận cảnh báo
                </h2>

                <div>
                  Tài khoản:{" "}

                  <strong>
                    {user.username}
                  </strong>
                </div>
              </div>


              <button
                type="button"
                aria-label="Đóng"
                disabled={
                  emailActionId !==
                  null
                }
                onClick={() => {
                  clearMessages();

                  setNewEmail("");

                  setManagingEmails(
                    false
                  );
                }}
              >
                ✕
              </button>
            </div>


            {/* EMAIL LIST */}

            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {(user.emails ??
                []).length ===
              0 ? (
                <div>
                  Chưa có Gmail.
                </div>
              ) : (
                user.emails.map(
                  (item) => (
                    <div
                      key={
                        item.id
                      }
                      style={{
                        display:
                          "flex",

                        alignItems:
                          "center",

                        justifyContent:
                          "space-between",

                        gap:
                          "12px",

                        flexWrap:
                          "wrap",

                        padding:
                          "12px",

                        border:
                          "1px solid #777",

                        borderRadius:
                          "8px",
                      }}
                    >
                      <div>
                        <div>
                          <strong>
                            {item.email}
                          </strong>
                        </div>


                        <div
                          style={{
                            marginTop:
                              "4px",

                            fontSize:
                              "0.9em",
                          }}
                        >
                          {item.isPrimary
                            ? "Gmail chính"
                            : "Gmail phụ"}

                          {" · "}

                          {item.active
                            ? "Đang bật"
                            : "Đã tắt"}
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
                        }}
                      >
                        {(
                          !item.isPrimary ||
                          !item.active
                        ) && (
                          <button
                            type="button"
                            disabled={
                              emailActionId !==
                              null
                            }
                            onClick={() =>
                              handleToggleEmail(
                                item
                              )
                            }
                          >
                            {emailActionId ===
                            item.id
                              ? "Đang xử lý..."
                              : item.active
                                ? "Tắt"
                                : "Bật"}
                          </button>
                        )}


                        {!item.isPrimary && (
                          <button
                            type="button"
                            disabled={
                              emailActionId !==
                              null
                            }
                            onClick={() =>
                              handleDeleteEmail(
                                item
                              )
                            }
                          >
                            {emailActionId ===
                            item.id
                              ? "Đang xử lý..."
                              : "Xóa"}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                )
              )}
            </div>


            {/* ADD EMAIL */}

            <hr
              style={{
                margin:
                  "20px 0",
              }}
            />


            <form
              onSubmit={
                handleAddEmail
              }
            >
              <label
                htmlFor={`new-email-${user.id}`}
              >
                <strong>
                  Thêm Gmail
                </strong>
              </label>


              <div
                style={{
                  display:
                    "flex",

                  gap:
                    "8px",

                  marginTop:
                    "8px",

                  flexWrap:
                    "wrap",
                }}
              >
                <input
                  id={`new-email-${user.id}`}
                  type="email"
                  placeholder="example@gmail.com"
                  value={
                    newEmail
                  }
                  onChange={(
                    event
                  ) =>
                    setNewEmail(
                      event.target
                        .value
                    )
                  }
                  disabled={
                    emailActionId !==
                    null
                  }
                  style={{
                    flex:
                      "1 1 280px",

                    minWidth:
                      "220px",
                  }}
                />


                <button
                  type="submit"
                  disabled={
                    emailActionId !==
                      null ||
                    !newEmail.trim()
                  }
                >
                  {emailActionId ===
                  "__new__"
                    ? "Đang thêm..."
                    : "+ Thêm Gmail"}
                </button>
              </div>
            </form>


            {/* MESSAGE */}

            {error && (
              <div
                style={{
                  marginTop:
                    "16px",
                }}
              >
                <strong>
                  {error}
                </strong>
              </div>
            )}


            {success && (
              <div
                style={{
                  marginTop:
                    "16px",
                }}
              >
                <strong>
                  {success}
                </strong>
              </div>
            )}


            {/* CLOSE */}

            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "flex-end",

                marginTop:
                  "20px",
              }}
            >
              <button
                type="button"
                disabled={
                  emailActionId !==
                  null
                }
                onClick={() => {
                  clearMessages();

                  setNewEmail("");

                  setManagingEmails(
                    false
                  );
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}