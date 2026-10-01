"use client";

import {
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


function isoToVietnamDate(
  value: string | null
): string {
  if (!value) {
    return "";
  }

  const parts =
    value.split("-");

  if (parts.length !== 3) {
    return value;
  }

  const [
    year,
    month,
    day,
  ] = parts;

  return `${day}/${month}/${year}`;
}


export default function ProductActions({
  product,
  onChanged,
}: Props) {
  // ====================================================
  // MODAL
  // ====================================================

  const [
    editing,
    setEditing,
  ] = useState(false);


  // ====================================================
  // FORM
  // ====================================================

  const [
    productCode,
    setProductCode,
  ] = useState(
    product.product_code
  );

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

  const [
    quantity,
    setQuantity,
  ] = useState(
    String(product.quantity)
  );

  const [
    note,
    setNote,
  ] = useState(
    product.note ?? ""
  );

  const [
    description,
    setDescription,
  ] = useState(
    product.description ?? ""
  );


  // ====================================================
  // UI
  // ====================================================

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");


  // ====================================================
  // OPEN EDITOR
  // ====================================================

  function openEditor() {
    /*
     * Reset lại theo dữ liệu mới nhất
     * mỗi lần mở modal.
     */

    setProductCode(
      product.product_code
    );

    setManufactureDate(
      isoToVietnamDate(
        product.manufacture_date
      )
    );

    setExpiryDate(
      isoToVietnamDate(
        product.expiry_date
      )
    );

    setReminderDate(
      isoToVietnamDate(
        product.reminder_date
      )
    );

    setQuantity(
      String(product.quantity)
    );

    setNote(
      product.note ?? ""
    );

    setDescription(
      product.description ?? ""
    );

    setError("");
    setEditing(true);
  }


  // ====================================================
  // CLOSE EDITOR
  // ====================================================

  function closeEditor() {
    if (loading) {
      return;
    }

    setError("");
    setEditing(false);
  }


  // ====================================================
  // EDIT
  // ====================================================

  async function handleUpdate(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");


    // ==================================================
    // NSX
    // ==================================================

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


    // ==================================================
    // HSD
    // ==================================================

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


    // ==================================================
    // NGÀY BÁO LẠI
    // ==================================================

    let reminderIso:
      | string
      | null = null;

    if (
      reminderDate.trim()
    ) {
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


    // ==================================================
    // SỐ LƯỢNG
    // ==================================================

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


    // ==================================================
    // MÃ SẢN PHẨM
    // ==================================================

    if (
      !productCode.trim()
    ) {
      setError(
        "Mã sản phẩm không được để trống."
      );

      return;
    }


    // ==================================================
    // GỬI API UPDATE
    // ==================================================

    try {
      setLoading(true);

      const response =
        await fetch(
          `/api/products/${product.id}`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
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

      const response =
        await fetch(
          `/api/products/${product.id}`,
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
  // RENDER
  // ====================================================

  return (
    <>
      {/* ===============================================
          BUTTONS TRONG TABLE
      ================================================ */}

      <div
        style={{
          display: "flex",
          gap: "6px",
          flexWrap: "nowrap",
        }}
      >
        <button
          type="button"
          onClick={
            openEditor
          }
          disabled={loading}
        >
          Sửa
        </button>


        <button
          type="button"
          onClick={
            handleDelete
          }
          disabled={loading}
        >
          {loading
            ? "Đang xử lý..."
            : "Xóa"}
        </button>
      </div>


      {!editing &&
        error && (
          <div>
            <strong>
              {error}
            </strong>
          </div>
        )}


      {/* ===============================================
          EDIT MODAL
      ================================================ */}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sửa sản phẩm"
          style={{
            position:
              "fixed",

            inset: 0,

            zIndex:
              9999,

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            padding:
              "20px",

            background:
              "rgba(0, 0, 0, 0.65)",
          }}
        >
          <div
            style={{
              width:
                "min(760px, 100%)",

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
                display:
                  "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "flex-start",

                gap:
                  "16px",

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
                  Sửa sản phẩm
                </h2>

                <div>
                  {product.product_name}
                </div>
              </div>


              <button
                type="button"
                onClick={
                  closeEditor
                }
                disabled={
                  loading
                }
                aria-label="Đóng"
              >
                ✕
              </button>
            </div>


            {/* FORM */}

            <form
              onSubmit={
                handleUpdate
              }
            >
              <div
                style={{
                  display:
                    "grid",

                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",

                  gap:
                    "16px",
                }}
              >
                {/* MÃ SP */}

                <label>
                  <div>
                    <strong>
                      Mã SP
                    </strong>
                  </div>

                  <input
                    type="text"
                    value={
                      productCode
                    }
                    onChange={(
                      event
                    ) =>
                      setProductCode(
                        event
                          .target
                          .value
                      )
                    }
                    disabled={
                      loading
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",
                    }}
                  />
                </label>


                {/* SỐ LƯỢNG */}

                <label>
                  <div>
                    <strong>
                      Số lượng
                    </strong>
                  </div>

                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={
                      quantity
                    }
                    onChange={(
                      event
                    ) =>
                      setQuantity(
                        event
                          .target
                          .value
                      )
                    }
                    disabled={
                      loading
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",
                    }}
                  />
                </label>


                {/* NSX */}

                <label>
                  <div>
                    <strong>
                      NSX
                    </strong>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    value={
                      manufactureDate
                    }
                    onChange={(
                      event
                    ) =>
                      setManufactureDate(
                        event
                          .target
                          .value
                      )
                    }
                    onBlur={() =>
                      setManufactureDate(
                        normalizeVietnamDateInput(
                          manufactureDate
                        )
                      )
                    }
                    disabled={
                      loading
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",
                    }}
                  />
                </label>


                {/* HSD */}

                <label>
                  <div>
                    <strong>
                      HSD
                    </strong>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    value={
                      expiryDate
                    }
                    onChange={(
                      event
                    ) =>
                      setExpiryDate(
                        event
                          .target
                          .value
                      )
                    }
                    onBlur={() =>
                      setExpiryDate(
                        normalizeVietnamDateInput(
                          expiryDate
                        )
                      )
                    }
                    disabled={
                      loading
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",
                    }}
                  />
                </label>


                {/* NGÀY BÁO LẠI */}

                <label>
                  <div>
                    <strong>
                      Ngày báo lại
                    </strong>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD/MM/YYYY"
                    value={
                      reminderDate
                    }
                    onChange={(
                      event
                    ) =>
                      setReminderDate(
                        event
                          .target
                          .value
                      )
                    }
                    onBlur={() =>
                      setReminderDate(
                        normalizeVietnamDateInput(
                          reminderDate
                        )
                      )
                    }
                    disabled={
                      loading
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",
                    }}
                  />
                </label>


                {/* NOTE */}

                <label>
                  <div>
                    <strong>
                      Note
                    </strong>
                  </div>

                  <input
                    type="text"
                    value={
                      note
                    }
                    onChange={(
                      event
                    ) =>
                      setNote(
                        event
                          .target
                          .value
                      )
                    }
                    disabled={
                      loading
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",
                    }}
                  />
                </label>


                {/* GHI CHÚ */}

                <label
                  style={{
                    gridColumn:
                      "1 / -1",
                  }}
                >
                  <div>
                    <strong>
                      Ghi chú
                    </strong>
                  </div>

                  <textarea
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) =>
                      setDescription(
                        event
                          .target
                          .value
                      )
                    }
                    disabled={
                      loading
                    }
                    rows={4}
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",

                      resize:
                        "vertical",
                    }}
                  />
                </label>
              </div>


              {/* ERROR */}

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


              {/* ACTIONS */}

              <div
                style={{
                  display:
                    "flex",

                  justifyContent:
                    "flex-end",

                  gap:
                    "10px",

                  marginTop:
                    "20px",
                }}
              >
                <button
                  type="button"
                  onClick={
                    closeEditor
                  }
                  disabled={
                    loading
                  }
                >
                  Hủy
                </button>


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
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}