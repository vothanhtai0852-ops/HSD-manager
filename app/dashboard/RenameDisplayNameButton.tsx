"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Props = { currentDisplayName: string };

export default function RenameDisplayNameButton({ currentDisplayName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function close() {
    if (loading) return;
    setOpen(false);
    setError("");
    setSuccess("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = displayName.trim();
    setError("");
    setSuccess("");
    if (!value || value.length > 100) {
      setError("Tên hiển thị phải có từ 1 đến 100 ký tự.");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch("/api/users/me/display-name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể đổi tên hiển thị.");
      setSuccess("Đã cập nhật tên hiển thị.");
      router.refresh();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể đổi tên hiển thị.");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button type="button" onClick={() => {
      setDisplayName(currentDisplayName);
      setError(""); setSuccess(""); setOpen(true);
    }} aria-label="Đổi tên hiển thị" title="Đổi tên hiển thị"
      style={{ minHeight: "38px", padding: "8px 12px", background: "#ffffff",
        color: "#171717", border: "1px solid rgba(255,255,255,0.75)",
        borderRadius: "8px", fontWeight: 800, whiteSpace: "nowrap" }}>
      Đổi tên hiển thị
    </button>
    {open && <div className="kk-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <div className="kk-modal password-modal">
        <div className="modal-heading"><div>
          <h2>Đổi tên hiển thị</h2>
          <div className="kk-muted">Chỉ đổi tên xuất hiện trên giao diện.
            Username đăng nhập không thay đổi.</div>
        </div>
          <button type="button" className="modal-close" onClick={close} disabled={loading} aria-label="Đóng">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-field">
            <label htmlFor="self-new-display-name">Tên hiển thị mới</label>
            <input id="self-new-display-name" type="text" maxLength={100}
              value={displayName} onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="off" disabled={loading} autoFocus />
          </div>
          {error && <div className="form-error">{error}</div>}
          {success && <div className="status-message status-success">{success}</div>}
          <div className="modal-actions">
            <button type="button" onClick={close} disabled={loading}>Hủy</button>
            <button type="submit" className="kk-button-primary" disabled={loading}>
              {loading ? "Đang lưu..." : "Lưu tên hiển thị"}
            </button>
          </div>
        </form>
      </div>
    </div>}
  </>;
}
