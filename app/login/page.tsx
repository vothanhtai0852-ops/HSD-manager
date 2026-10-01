"use client";

import {
  useState,
  type FormEvent,
} from "react";

import {
  useRouter,
} from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const normalizedUsername =
      username.trim();

    if (!normalizedUsername) {
      setError("Vui lòng nhập tài khoản.");
      return;
    }

    if (!password) {
      setError("Vui lòng nhập mật khẩu.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "/api/auth/login",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            username:
              normalizedUsername,
            password,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Đăng nhập không thành công."
        );
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Đăng nhập không thành công."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-brand-panel">
          <div className="login-orb login-orb-one" />
          <div className="login-orb login-orb-two" />

          <div className="login-brand-content">
            <div className="login-brand-badge">
              AUTO CHECK
            </div>

            <div className="login-brand-name">
              KINGKONG MART
            </div>

            <h1>
              Luôn đảm bảo HSD sản phẩm được kiểm soát
            </h1>

            <p>
              Quản lý sản phẩm, hạn sử dụng và cảnh báo tập trung trên một hệ thống duy nhất.
            </p>
          </div>

          <div className="login-feature-grid">
            <div>Theo dõi HSD</div>
            <div>Cảnh báo tự động</div>
            <div>Quản lý tập trung</div>
          </div>
        </section>

        <section className="login-form-panel">
          <div className="login-form-inner">
            <div className="login-mobile-brand">
              <span>KINGKONG MART</span>
              <strong>AUTO CHECK</strong>
            </div>

            <div className="login-kicker">
              HSD MANAGER
            </div>

            <h2>Đăng nhập</h2>

            <p className="login-subtitle">
              Nhập tài khoản để truy cập hệ thống AUTO CHECK.
            </p>

            <form onSubmit={handleSubmit}>
              <label className="login-field">
                <span>Tài khoản</span>

                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target.value
                    )
                  }
                  disabled={loading}
                  placeholder="Nhập username"
                  autoFocus
                />
              </label>

              <label className="login-field">
                <span>Mật khẩu</span>

                <div className="login-password-wrap">
                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) =>
                      setPassword(
                        event.target.value
                      )
                    }
                    disabled={loading}
                    placeholder="Nhập mật khẩu"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current
                      )
                    }
                    disabled={loading}
                    className="login-password-toggle"
                  >
                    {showPassword
                      ? "Ẩn"
                      : "Hiện"}
                  </button>
                </div>
              </label>

              {error && (
                <div
                  className="login-error"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="login-submit"
                disabled={loading}
              >
                {loading
                  ? "Đang đăng nhập..."
                  : "Đăng nhập"}
              </button>
            </form>

            <div className="login-footer">
              KINGKONG MART · AUTO CHECK
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background:
            linear-gradient(
              135deg,
              #f2f4f7 0%,
              #ffffff 52%,
              #fff4f4 100%
            );
        }

        .login-shell {
          width: min(960px, 100%);
          display: grid;
          grid-template-columns:
            minmax(0, 1.05fr)
            minmax(360px, 0.95fr);
          overflow: hidden;
          border: 1px solid var(--border);
          border-radius: 22px;
          background: #ffffff;
          box-shadow:
            0 24px 70px
            rgba(15, 23, 42, 0.14);
        }

        .login-brand-panel {
          position: relative;
          min-height: 560px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 42px;
          margin: 0;
          border: 0;
          border-radius: 0;
          background:
            linear-gradient(
              145deg,
              var(--kk-red) 0%,
              var(--kk-red-dark) 100%
            );
          color: #ffffff;
          box-shadow: none;
          overflow: hidden;
        }

        .login-orb {
          position: absolute;
          border-radius: 999px;
          pointer-events: none;
        }

        .login-orb-one {
          width: 310px;
          height: 310px;
          right: -110px;
          top: -90px;
          background:
            rgba(255, 255, 255, 0.07);
        }

        .login-orb-two {
          width: 210px;
          height: 210px;
          left: -80px;
          bottom: -85px;
          background:
            rgba(255, 210, 31, 0.12);
        }

        .login-brand-content,
        .login-feature-grid {
          position: relative;
          z-index: 1;
        }

        .login-brand-badge {
          display: inline-flex;
          align-items: center;
          padding: 9px 12px;
          border:
            1px solid
            rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          background:
            rgba(255, 255, 255, 0.08);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .login-brand-name {
          margin-top: 32px;
          color: var(--kk-yellow);
          font-size: 34px;
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: 0.015em;
        }

        .login-brand-panel h1 {
          max-width: 470px;
          margin: 18px 0 0;
          color: #ffffff;
          font-size: 31px;
          font-weight: 850;
          line-height: 1.18;
        }

        .login-brand-panel p {
          max-width: 470px;
          margin: 16px 0 0;
          color:
            rgba(255, 255, 255, 0.82);
          font-size: 15px;
          line-height: 1.7;
        }

        .login-feature-grid {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .login-feature-grid div {
          min-height: 74px;
          display: flex;
          align-items: flex-end;
          padding: 12px;
          border:
            1px solid
            rgba(255, 255, 255, 0.13);
          border-radius: 12px;
          background:
            rgba(255, 255, 255, 0.07);
          color:
            rgba(255, 255, 255, 0.92);
          font-size: 12px;
          font-weight: 800;
          line-height: 1.4;
        }

        .login-form-panel {
          min-height: 560px;
          display: flex;
          align-items: center;
          padding: 46px;
          margin: 0;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          background: #ffffff;
        }

        .login-form-inner {
          width: 100%;
          max-width: 390px;
          margin: 0 auto;
        }

        .login-mobile-brand {
          display: none;
        }

        .login-kicker {
          color: var(--kk-red);
          font-size: 12px;
          font-weight: 850;
          letter-spacing: 0.08em;
        }

        .login-form-panel h2 {
          margin: 7px 0 6px;
          font-size: 28px;
          font-weight: 850;
          color: #111827;
        }

        .login-subtitle {
          margin: 0 0 28px;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
        }

        .login-field {
          display: block;
          margin-bottom: 18px;
        }

        .login-field > span {
          display: block;
          margin-bottom: 7px;
          color: #334155;
          font-size: 13px;
          font-weight: 800;
        }

        .login-field input {
          width: 100%;
          min-height: 46px;
          padding: 10px 13px;
          border-radius: 10px;
        }

        .login-password-wrap {
          position: relative;
        }

        .login-password-wrap input {
          padding-right: 76px;
        }

        .login-password-toggle {
          position: absolute;
          top: 50%;
          right: 7px;
          transform: translateY(-50%);
          min-height: 32px;
          padding: 4px 9px;
          border: 0;
          background: transparent;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 800;
          box-shadow: none;
        }

        .login-password-toggle:hover:not(:disabled) {
          background: #f8fafc;
          color: var(--kk-red);
          border: 0;
        }

        .login-error {
          margin-bottom: 16px;
          padding: 11px 12px;
          border: 1px solid #fecaca;
          border-radius: 10px;
          background: #fff1f2;
          color: #be123c;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.45;
        }

        .login-submit {
          width: 100%;
          min-height: 46px;
          border-radius: 10px;
          background: var(--kk-red);
          border-color: var(--kk-red);
          color: #ffffff;
          font-size: 14px;
          font-weight: 850;
        }

        .login-submit:hover:not(:disabled) {
          background: var(--kk-red-dark);
          border-color: var(--kk-red-dark);
          color: #ffffff;
        }

        .login-footer {
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid var(--border);
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.55;
          text-align: center;
        }

        @media (max-width: 820px) {
          .login-shell {
            grid-template-columns: 1fr;
            max-width: 520px;
          }

          .login-brand-panel {
            display: none;
          }

          .login-form-panel {
            min-height: auto;
            padding: 30px 22px;
          }

          .login-mobile-brand {
            display: flex;
            align-items: center;
            justify-content:
              space-between;
            gap: 12px;
            margin-bottom: 24px;
            padding: 12px 14px;
            border-radius: 12px;
            background:
              linear-gradient(
                90deg,
                var(--kk-red),
                var(--kk-red-dark)
              );
          }

          .login-mobile-brand span {
            color: var(--kk-yellow);
            font-size: 16px;
            font-weight: 900;
          }

          .login-mobile-brand strong {
            color: #ffffff;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 0.05em;
          }
        }

        @media (max-width: 480px) {
          .login-page {
            padding: 12px;
          }

          .login-form-panel {
            padding: 24px 16px;
          }
        }
      `}</style>
    </main>
  );
}
