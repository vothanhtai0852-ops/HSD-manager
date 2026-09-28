"use client";

import {
  useState,
  type FormEvent,
} from "react";

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

function isoToVietnamDate(
  value: string | null
): string {
  if (!value) {
    return "";
  }

  const parts = value.split("-");

  if (parts.length !== 3) {
    return value;
  }

  const [year, month, day] = parts;

  return `${day}/${month}/${year}`;
}

function vietnamDateToIso(
  value: string
): string | null {
  const trimmed = value.trim();

  const match = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

export default function ProductActions({
  product,
  onChanged,
}: Props) {
  const [editing, setEditing] =
    useState(false);

  const [productCode, setProductCode] =
    useState(product.product_code);

  const [
    manufactureDate,
    setManufactureDate,
  ] = useState(
    isoToVietnamDate(
      product.manufacture_date
    )
  );

  const [
    expiryDate,
    setExpiryDate,
  ] = useState(
    isoToVietnamDate(
      product.expiry_date
    )
  );

  const [
    reminderDate,
    setReminderDate,
  ] = useState(
    isoToVietnamDate(
      product.reminder_date
    )
  );

  const [quantity, setQuantity] =
    useState(
      String(product.quantity)
    );

  const [note, setNote] =
    useState(product.note ?? "");

  const [
    description,
    setDescription,
  ] = useState(
    product.description ?? ""
  );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  // ====================================================
  // EDIT
  // ====================================================

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const nsxIso =
      vietnamDateToIso(
        manufactureDate
      );

    if (!nsxIso) {
      setError(
        "NSX phải đúng định dạng DD/MM/YYYY."
      );

      return;
    }

    const hsdIso =
      vietnamDateToIso(
        expiryDate
      );

    if (!hsdIso) {
      setError(
        "HSD phải đúng định dạng DD/MM/YYYY."
      );

      return;
    }

    let reminderIso:
      | string
      | null = null;

    if (reminderDate.trim()) {
      reminderIso =
        vietnamDateToIso(
          reminderDate
        );

      if (!reminderIso) {
        setError(
          "Ngày báo lại phải đúng định dạng DD/MM/YYYY."
        );

        return;
      }
    }

    const quantityNumber =
      Number(quantity);

    if (
      !Number.isFinite(
        quantityNumber
      ) ||
      quantityNumber < 0
    ) {
      setError(
        "Số lượng không hợp lệ."
      );

      return;
    }

    if (!productCode.trim()) {
      setError(
        "Mã sản phẩm không được để trống."
      );

      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        `/api/products/${product.id}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            productCode:
              productCode.trim(),

            manufactureDate:
              nsxIso,

            expiryDate:
              hsdIso,

            quantity:
              quantityNumber,

            reminderDate:
              reminderIso,

            note:
              note.trim() || null,

            description:
              description.trim() ||
              null,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể cập nhật sản phẩm."
        );
      }

      setEditing(false);

      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể cập nhật sản phẩm."
      );
    } finally {
      setLoading(false);
    }
  }

  // ====================================================
  // DELETE
  // ====================================================

  async function handleDelete() {
    const confirmed =
      window.confirm(
        `Xóa sản phẩm "${product.product_name}"?\n\nMã SP: ${product.product_code}`
      );

    if (!confirmed) {
      return;
    }

    setError("");

    try {
      setLoading(true);

      const response = await fetch(
        `/api/products/${product.id}`,
        {
          method: "DELETE",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Không thể xóa sản phẩm."
        );
      }

      onChanged();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xóa sản phẩm."
      );
    } finally {
      setLoading(false);
    }
  }

  // ====================================================
  // NORMAL VIEW
  // ====================================================

  if (!editing) {
    return (
      <div>
        <button
          type="button"
          onClick={() =>
            setEditing(true)
          }
          disabled={loading}
        >
          Sửa
        </button>

        {" "}

        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading
            ? "Đang xử lý..."
            : "Xóa"}
        </button>

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

  // ====================================================
  // EDIT FORM
  // ====================================================

  return (
    <div>
      <form
        onSubmit={handleUpdate}
      >
        <div>
          <label>
            Mã SP
          </label>

          <br />

          <input
            type="text"
            value={productCode}
            onChange={(event) =>
              setProductCode(
                event.target.value
              )
            }
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label>
            NSX
          </label>

          <br />

          <input
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            value={manufactureDate}
            onChange={(event) =>
              setManufactureDate(
                event.target.value
              )
            }
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label>
            HSD
          </label>

          <br />

          <input
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            value={expiryDate}
            onChange={(event) =>
              setExpiryDate(
                event.target.value
              )
            }
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label>
            Số lượng
          </label>

          <br />

          <input
            type="number"
            min="0"
            step="0.001"
            value={quantity}
            onChange={(event) =>
              setQuantity(
                event.target.value
              )
            }
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label>
            Ngày báo lại
          </label>

          <br />

          <input
            type="text"
            inputMode="numeric"
            placeholder="DD/MM/YYYY"
            value={reminderDate}
            onChange={(event) =>
              setReminderDate(
                event.target.value
              )
            }
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label>
            Note
          </label>

          <br />

          <input
            type="text"
            value={note}
            onChange={(event) =>
              setNote(
                event.target.value
              )
            }
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label>
            Ghi chú
          </label>

          <br />

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
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
            setError("");
            setEditing(false);
          }}
        >
          Hủy
        </button>
      </form>
    </div>
  );
}