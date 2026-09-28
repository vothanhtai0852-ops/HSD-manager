"use client";

import {
  useState,
  type FormEvent,
} from "react";

function convertVietnamDateToIso(
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
    Date.UTC(year, month - 1, day)
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

export default function AddProductForm() {
  const [productCode, setProductCode] =
    useState("");

  const [
    manufactureDate,
    setManufactureDate,
  ] = useState("");

  const [
    expiryDate,
    setExpiryDate,
  ] = useState("");

  const [
    reminderDate,
    setReminderDate,
  ] = useState("");

  const [quantity, setQuantity] =
    useState("1");

  const [note, setNote] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const nsxIso =
      convertVietnamDateToIso(
        manufactureDate
      );

    if (!nsxIso) {
      setError(
        "NSX phải đúng định dạng DD/MM/YYYY."
      );

      return;
    }

    const hsdIso =
      convertVietnamDateToIso(
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
        convertVietnamDateToIso(
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
        "Vui lòng nhập mã sản phẩm."
      );

      return;
    }

    try {
      setLoading(true);

      const response = await fetch(
        "/api/products",
        {
          method: "POST",

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
              note.trim() ||
              null,

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
            "Không thể thêm sản phẩm."
        );
      }

      setSuccess(
        data.message ||
          "Thêm sản phẩm thành công."
      );

      setProductCode("");
      setManufactureDate("");
      setExpiryDate("");
      setReminderDate("");
      setQuantity("1");
      setNote("");
      setDescription("");

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể thêm sản phẩm."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2>
        Thêm sản phẩm
      </h2>

      <form
        onSubmit={handleSubmit}
      >
        <div>
          <label htmlFor="add-product-code">
            Mã sản phẩm
          </label>

          <br />

          <input
            id="add-product-code"
            type="text"
            value={productCode}
            onChange={(event) =>
              setProductCode(
                event.target.value
              )
            }
            placeholder="Nhập mã SP"
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label htmlFor="add-manufacture-date">
            NSX
          </label>

          <br />

          <input
            id="add-manufacture-date"
            type="text"
            inputMode="numeric"
            value={manufactureDate}
            onChange={(event) =>
              setManufactureDate(
                event.target.value
              )
            }
            placeholder="DD/MM/YYYY"
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label htmlFor="add-expiry-date">
            HSD
          </label>

          <br />

          <input
            id="add-expiry-date"
            type="text"
            inputMode="numeric"
            value={expiryDate}
            onChange={(event) =>
              setExpiryDate(
                event.target.value
              )
            }
            placeholder="DD/MM/YYYY"
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label htmlFor="add-quantity">
            Số lượng
          </label>

          <br />

          <input
            id="add-quantity"
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
          <label htmlFor="add-reminder-date">
            Ngày báo lại
          </label>

          <br />

          <input
            id="add-reminder-date"
            type="text"
            inputMode="numeric"
            value={reminderDate}
            onChange={(event) =>
              setReminderDate(
                event.target.value
              )
            }
            placeholder="DD/MM/YYYY - Không bắt buộc"
            disabled={loading}
          />
        </div>

        <br />

        <div>
          <label htmlFor="add-note">
            Note
          </label>

          <br />

          <input
            id="add-note"
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
          <label htmlFor="add-description">
            Ghi chú
          </label>

          <br />

          <textarea
            id="add-description"
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
            ? "Đang thêm..."
            : "Thêm sản phẩm"}
        </button>
      </form>
    </section>
  );
}