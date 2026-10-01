"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  normalizeVietnamDateInput,
  vietnamDateToIso,
} from "@/lib/date-utils";

type Product = {
  id: string;
  product_code: string;
  product_name: string;
  manufacture_date: string | null;
  expiry_date: string | null;
  reminder_date: string | null;
  quantity: number;
  note: string | null;
  description: string | null;
};

type Props = {
  product: Product;
  onChanged: () => void;
};

function isoToVietnamDate(value: string | null): string {
  if (!value) return "";

  const parts = value.split("-");
  if (parts.length !== 3) return value;

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

export default function ProductActions({
  product,
  onChanged,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [productCode, setProductCode] = useState(product.product_code);
  const [manufactureDate, setManufactureDate] = useState(
    isoToVietnamDate(product.manufacture_date)
  );
  const [expiryDate, setExpiryDate] = useState(
    isoToVietnamDate(product.expiry_date)
  );
  const [reminderDate, setReminderDate] = useState(
    isoToVietnamDate(product.reminder_date)
  );
  const [quantity, setQuantity] = useState(String(product.quantity));
  const [note, setNote] = useState(product.note ?? "");
  const [description, setDescription] = useState(product.description ?? "");

  const [loading, setLoading] = useState<"update" | "delete" | null>(null);
  const [error, setError] = useState("");

  function resetForm() {
    setProductCode(product.product_code);
    setManufactureDate(isoToVietnamDate(product.manufacture_date));
    setExpiryDate(isoToVietnamDate(product.expiry_date));
    setReminderDate(isoToVietnamDate(product.reminder_date));
    setQuantity(String(product.quantity));
    setNote(product.note ?? "");
    setDescription(product.description ?? "");
    setError("");
  }

  function openEdit() {
    resetForm();
    setDeleteOpen(false);
    setEditing(true);
  }

  function closeEdit() {
    if (loading) return;
    setError("");
    setEditing(false);
  }

  function openDelete() {
    setError("");
    setEditing(false);
    setDeleteOpen(true);
  }

  function closeDelete() {
    if (loading) return;
    setError("");
    setDeleteOpen(false);
  }

  useEffect(() => {
    if (!editing && !deleteOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || loading) return;

      setError("");
      setEditing(false);
      setDeleteOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editing, deleteOpen, loading]);

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!productCode.trim()) {
      setError("Mã sản phẩm không được để trống.");
      return;
    }

    const nsxIso = vietnamDateToIso(manufactureDate);
    if (!nsxIso) {
      setError("NSX không hợp lệ.");
      return;
    }

    const hsdIso = vietnamDateToIso(expiryDate);
    if (!hsdIso) {
      setError("HSD không hợp lệ.");
      return;
    }

    let reminderIso: string | null = null;

    if (reminderDate.trim()) {
      reminderIso = vietnamDateToIso(reminderDate);

      if (!reminderIso) {
        setError("Ngày báo lại không hợp lệ.");
        return;
      }
    }

    const quantityNumber = Number(quantity);

    if (
      !Number.isFinite(quantityNumber) ||
      quantityNumber < 0 ||
      !Number.isInteger(quantityNumber)
    ) {
      setError("Số lượng không hợp lệ.");
      return;
    }

    try {
      setLoading("update");

      const response = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productCode: productCode.trim(),
          manufactureDate: nsxIso,
          expiryDate: hsdIso,
          quantity: quantityNumber,
          reminderDate: reminderIso,
          note: note.trim() || null,
          description: description.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể cập nhật sản phẩm.");
      }

      setEditing(false);
      setError("");
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật sản phẩm."
      );
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    setError("");

    try {
      setLoading("delete");

      const response = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể xóa sản phẩm.");
      }

      setDeleteOpen(false);
      setError("");
      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xóa sản phẩm."
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={openEdit}
          disabled={loading !== null}
          style={{
            minWidth: "58px",
            minHeight: "38px",
            padding: "7px 12px",
            background: "#f1f5f9",
            borderColor: "#e2e8f0",
            color: "#1e293b",
          }}
        >
          Sửa
        </button>

        <button
          type="button"
          onClick={openDelete}
          disabled={loading !== null}
          style={{
            minWidth: "58px",
            minHeight: "38px",
            padding: "7px 12px",
            background: "#e52c3b",
            borderColor: "#e52c3b",
            color: "#ffffff",
          }}
        >
          Xóa
        </button>
      </div>

      {editing && (
        <div
          className="kk-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`edit-product-${product.id}`}
          onMouseDown={closeEdit}
        >
          <div
            className="kk-modal"
            style={{ width: "min(760px, 100%)" }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
                marginBottom: "18px",
              }}
            >
              <div>
                <h2
                  id={`edit-product-${product.id}`}
                  style={{ margin: "0 0 4px", fontSize: "21px" }}
                >
                  Sửa sản phẩm
                </h2>

                <div
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                  }}
                >
                  {product.product_name}
                </div>
              </div>

              <button
                type="button"
                onClick={closeEdit}
                disabled={loading !== null}
                aria-label="Đóng"
                style={{
                  width: "36px",
                  minWidth: "36px",
                  minHeight: "36px",
                  padding: 0,
                  borderRadius: "10px",
                  fontSize: "20px",
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdate}>
              <div className="product-edit-grid">
                <label>
                  <span>Mã SP</span>
                  <input
                    type="text"
                    value={productCode}
                    onChange={(event) => setProductCode(event.target.value)}
                    disabled={loading !== null}
                  />
                </label>

                <label>
                  <span>Số lượng</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    disabled={loading !== null}
                  />
                </label>

                <label>
                  <span>NSX</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    value={manufactureDate}
                    onChange={(event) => setManufactureDate(event.target.value)}
                    onBlur={() =>
                      setManufactureDate(
                        normalizeVietnamDateInput(manufactureDate)
                      )
                    }
                    disabled={loading !== null}
                  />
                </label>

                <label>
                  <span>HSD</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    value={expiryDate}
                    onChange={(event) => setExpiryDate(event.target.value)}
                    onBlur={() =>
                      setExpiryDate(
                        normalizeVietnamDateInput(expiryDate)
                      )
                    }
                    disabled={loading !== null}
                  />
                </label>

                <label>
                  <span>Ngày báo lại</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    value={reminderDate}
                    onChange={(event) => setReminderDate(event.target.value)}
                    onBlur={() =>
                      setReminderDate(
                        normalizeVietnamDateInput(reminderDate)
                      )
                    }
                    disabled={loading !== null}
                  />
                </label>

                <label>
                  <span>Note</span>
                  <input
                    type="text"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    disabled={loading !== null}
                  />
                </label>

                <label className="product-edit-full">
                  <span>Ghi chú</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={loading !== null}
                  />
                </label>
              </div>

              {error && (
                <div className="action-error">
                  {error}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "18px",
                }}
              >
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={loading !== null}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="kk-button-primary"
                  disabled={loading !== null}
                >
                  {loading === "update"
                    ? "Đang lưu..."
                    : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div
          className="kk-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-product-${product.id}`}
          onMouseDown={closeDelete}
        >
          <div
            className="kk-modal"
            style={{
              width: "min(460px, 100%)",
              padding: "22px",
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="delete-icon" aria-hidden="true">
              !
            </div>

            <h2
              id={`delete-product-${product.id}`}
              style={{
                margin: "0 0 8px",
                fontSize: "21px",
              }}
            >
              Xóa sản phẩm?
            </h2>

            <p
              style={{
                margin: "0 0 14px",
                color: "var(--text-secondary)",
                fontSize: "14px",
                lineHeight: 1.55,
              }}
            >
              Sản phẩm sẽ bị xóa khỏi hệ thống. Kiểm tra lại thông tin trước khi tiếp tục.
            </p>

            <div className="delete-product-card">
              <div className="delete-product-name">
                {product.product_name}
              </div>

              <div className="delete-product-code">
                Mã SP: <strong>{product.product_code}</strong>
              </div>
            </div>

            {error && (
              <div className="action-error">
                {error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "18px",
              }}
            >
              <button
                type="button"
                onClick={closeDelete}
                disabled={loading !== null}
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={loading !== null}
                style={{
                  background: "#dc2626",
                  borderColor: "#dc2626",
                  color: "#ffffff",
                  minWidth: "116px",
                }}
              >
                {loading === "delete"
                  ? "Đang xóa..."
                  : "Xóa sản phẩm"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .product-edit-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .product-edit-grid label span {
          display: block;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .product-edit-grid input,
        .product-edit-grid textarea {
          width: 100%;
        }

        .product-edit-grid textarea {
          min-height: 84px;
        }

        .product-edit-full {
          grid-column: 1 / -1;
        }

        .action-error {
          margin-top: 14px;
          padding: 10px 12px;
          border: 1px solid #fecaca;
          border-radius: 9px;
          background: #fff1f2;
          color: #be123c;
          font-size: 13px;
          font-weight: 700;
        }

        .delete-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          margin-bottom: 14px;
          border-radius: 14px;
          background: #fff1f2;
          color: #dc2626;
          font-size: 24px;
          font-weight: 900;
        }

        .delete-product-card {
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface-soft);
        }

        .delete-product-name {
          color: var(--foreground);
          font-weight: 800;
          overflow-wrap: anywhere;
        }

        .delete-product-code {
          margin-top: 4px;
          color: var(--text-secondary);
          font-size: 13px;
        }

        @media (max-width: 640px) {
          .product-edit-grid {
            grid-template-columns: 1fr;
          }

          .product-edit-full {
            grid-column: auto;
          }
        }
      `}</style>
    </>
  );
}
