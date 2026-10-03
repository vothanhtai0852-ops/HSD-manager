"use client";

import {
  useState,
  type FormEvent,
} from "react";
import {
  useRouter,
} from "next/navigation";

type Props = {
  currentUsername: string;
};

export default function RenameUsernameButton({
  currentUsername,
}: Props) {
  const router = useRouter();

  const [open, setOpen] =
    useState(false);

  const [username, setUsername] =
    useState(currentUsername);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  function closeModal() {
    if (loading) {
      return;
    }

    setOpen(false);
    setUsername(
      currentUsername
    );
    setError("");
    setSuccess("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const normalized =
      username.trim();

    setError("");
    setSuccess("");

    if (!normalized) {
      setError(
        "Vui lòng nhập Username mới."
      );
      return;
    }

    if (
      !/^[A-Za-z0-9._-]{2,50}$/.test(
        normalized
      )
    ) {
      setError(
        "Username chỉ được dùng chữ, số, dấu chấm, gạch dưới, gạch ngang và dài 2-50 ký tự."
      );
      return;
    }

    try {
      setLoading(true);

      const response =
        await fetch(
          "/api/users/me/username",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                username:
                  normalized,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể đổi Username."
        );
      }

      setSuccess(
        data.message ||
          "Đổi Username thành công."
      );

      router.refresh();

      window.setTimeout(() => {
        setOpen(false);
        setError("");
        setSuccess("");
      }, 500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể đổi Username."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUsername(
            currentUsername
          );
          setError("");
          setSuccess("");
          setOpen(true);
        }}
        aria-label="Đổi Username"
        title="Đổi Username"
        style={{
          minHeight: "38px",
          padding: "8px 12px",
          background: "#ffffff",
          color: "#171717",
          border:
            "1px solid rgba(255,255,255,0.75)",
          borderRadius: "8px",
          fontWeight: 800,
          whiteSpace:
            "nowrap",
        }}
      >
        Đổi Username
      </button>

      {open && (
        <div
          className="kk-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <div className="kk-modal password-modal">
            <div className="modal-heading">
              <div>
                <h2>
                  Đổi Username
                </h2>

                <div className="kk-muted">
                  Username hiện tại:{" "}
                  <strong>
                    {currentUsername}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeModal
                }
                disabled={
                  loading
                }
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={
                handleSubmit
              }
            >
              <div className="form-field">
                <label
                  htmlFor="self-new-username"
                >
                  Username mới
                </label>

                <input
                  id="self-new-username"
                  type="text"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target
                        .value
                    )
                  }
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={
                    loading
                  }
                />
              </div>

              {error && (
                <div className="form-error">
                  {error}
                </div>
              )}

              {success && (
                <div className="status-message status-success">
                  {success}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  disabled={
                    loading
                  }
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="kk-button-primary"
                  disabled={
                    loading
                  }
                >
                  {loading
                    ? "Đang đổi..."
                    : "Lưu Username"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
