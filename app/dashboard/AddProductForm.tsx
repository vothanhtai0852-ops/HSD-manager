"use client";

import {
  useState,
  type FormEvent,
} from "react";

import {
  normalizeVietnamDateInput,
  vietnamDateToIso,
} from "@/lib/date-utils";


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


    /*
     * ================================================
     * NSX
     * ================================================
     */

    const nsxIso =
      vietnamDateToIso(
        manufactureDate
      );

    if (!nsxIso) {
      setError(
        "NSX không hợp lệ. Ví dụ: 12092026, 120926 hoặc 12/9/2026."
      );

      return;
    }


    /*
     * ================================================
     * HSD
     * ================================================
     */

    const hsdIso =
      vietnamDateToIso(
        expiryDate
      );

    if (!hsdIso) {
      setError(
        "HSD không hợp lệ. Ví dụ: 12092026, 120926 hoặc 12/9/2026."
      );

      return;
    }


    /*
     * ================================================
     * NGÀY BÁO LẠI
     * ================================================
     */

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
          "Ngày báo lại không hợp lệ. Ví dụ: 12092026, 120926 hoặc 12/9/2026."
        );

        return;
      }
    }


    /*
     * ================================================
     * SỐ LƯỢNG
     * ================================================
     */

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


    /*
     * ================================================
     * MÃ SẢN PHẨM
     * ================================================
     */

    if (!productCode.trim()) {
      setError(
        "Vui lòng nhập mã sản phẩm."
      );

      return;
    }


    /*
     * ================================================
     * GỬI API
     * ================================================
     */

    try {
      setLoading(true);

      const response =
        await fetch(
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


      /*
       * Reset form
       */

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
        {/* =========================================
            MÃ SẢN PHẨM
        ========================================== */}

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


        {/* =========================================
            NSX
        ========================================== */}

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
            onBlur={() =>
              setManufactureDate(
                normalizeVietnamDateInput(
                  manufactureDate
                )
              )
            }
            placeholder="DD/MM/YYYY"
            disabled={loading}
          />
        </div>


        <br />


        {/* =========================================
            HSD
        ========================================== */}

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
            onBlur={() =>
              setExpiryDate(
                normalizeVietnamDateInput(
                  expiryDate
                )
              )
            }
            placeholder="DD/MM/YYYY"
            disabled={loading}
          />
        </div>


        <br />


        {/* =========================================
            SỐ LƯỢNG
        ========================================== */}

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


        {/* =========================================
            NGÀY BÁO LẠI
        ========================================== */}

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
            onBlur={() =>
              setReminderDate(
                normalizeVietnamDateInput(
                  reminderDate
                )
              )
            }
            placeholder="DD/MM/YYYY - Không bắt buộc"
            disabled={loading}
          />
        </div>


        <br />


        {/* =========================================
            NOTE
        ========================================== */}

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


        {/* =========================================
            GHI CHÚ
        ========================================== */}

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


        {/* =========================================
            MESSAGE
        ========================================== */}

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


        {/* =========================================
            SUBMIT
        ========================================== */}

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