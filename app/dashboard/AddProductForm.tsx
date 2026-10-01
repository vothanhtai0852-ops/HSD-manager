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

type CatalogItem = {
  id: string;
  productCode: string;
  productName: string;
  salePrice: number | null;
};

export default function AddProductForm() {
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [productSuggestions, setProductSuggestions] = useState<CatalogItem[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSearchDone, setProductSearchDone] = useState(false);

  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const query = productCode.trim();

    setProductName("");
    setProductSearchDone(false);

    if (query.length < 6) {
      setProductSuggestions([]);
      setProductSearchLoading(false);
      return;
    }

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      try {
        setProductSearchLoading(true);

        const response = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        if (!response.ok) {
          setProductSuggestions([]);
          setProductSearchDone(true);
          return;
        }

        const data = await response.json();

        const items: CatalogItem[] = Array.isArray(data.items)
          ? data.items
          : [];

        setProductSuggestions(items);

        const exactMatch = items.find(
          (item) =>
            item.productCode.trim().toLowerCase() === query.toLowerCase()
        );

        if (exactMatch) {
          setProductName(exactMatch.productName || "");
        }

        setProductSearchDone(true);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("PRODUCT_SEARCH_ERROR:", err);
        setProductSuggestions([]);
        setProductSearchDone(true);
      } finally {
        if (!controller.signal.aborted) {
          setProductSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [productCode]);

  function selectProduct(item: CatalogItem) {
    setProductCode(item.productCode);
    setProductName(item.productName || "");
    setProductSuggestions([]);
    setProductSearchDone(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!productCode.trim()) {
      setError("Vui lòng nhập mã sản phẩm.");
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
      setLoading(true);

      const response = await fetch("/api/products", {
        method: "POST",
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
        throw new Error(data.error || "Không thể thêm sản phẩm.");
      }

      setSuccess(data.message || "Thêm sản phẩm thành công.");

      setProductCode("");
      setProductName("");
      setProductSuggestions([]);
      setProductSearchDone(false);
      setManufactureDate("");
      setExpiryDate("");
      setReminderDate("");
      setQuantity("1");
      setNote("");
      setDescription("");

      window.dispatchEvent(
        new CustomEvent("hsd:products-changed")
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể thêm sản phẩm."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="add-product-section">
      <div className="add-product-heading">
        <div>
          <h2 style={{ margin: "0 0 4px" }}>Thêm sản phẩm</h2>

          <p
            style={{
              margin: 0,
              color: "var(--text-secondary)",
            }}
          >
            Nhập thông tin HSD để theo dõi và cảnh báo tự động.
          </p>
        </div>

        <div className="add-product-badge">
          AUTO CHECK
        </div>
      </div>

      <form onSubmit={handleSubmit} className="add-product-form">
        <div className="add-product-row-one">
          <div className="add-field add-field-code">
            <label htmlFor="add-product-code">
              Mã sản phẩm
              <span className="required-mark">*</span>
            </label>

            <input
              id="add-product-code"
              type="text"
              value={productCode}
              onChange={(event) => {
                setProductCode(event.target.value);
                setProductName("");
              }}
              placeholder="Nhập mã SP"
              disabled={loading}
              autoComplete="off"
            />

            {productCode.trim().length >= 6 && productSearchLoading && (
              <div className="field-help">
                Đang tìm sản phẩm...
              </div>
            )}

            {productSuggestions.length > 0 && (
              <div className="product-suggestions">
                {productSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectProduct(item)}
                    className="product-suggestion-item"
                  >
                    <div className="suggestion-code">
                      {item.productCode}
                    </div>

                    <div className="suggestion-name">
                      {item.productName}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {productCode.trim().length >= 6 &&
              productSearchDone &&
              !productSearchLoading &&
              productSuggestions.length === 0 &&
              !productName && (
                <div className="field-help">
                  Không tìm thấy mã phù hợp.
                </div>
              )}
          </div>

          <div className="add-field add-field-name">
            <div className="field-label">
              Tên sản phẩm
            </div>

            <div
              title={productName || ""}
              className={`product-name-display ${
                productName ? "has-product" : ""
              }`}
            >
              {productName || "Tự động theo mã SP"}
            </div>
          </div>

          <div className="add-field">
            <label htmlFor="add-quantity">
              Số lượng
            </label>

            <input
              id="add-quantity"
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={loading}
            />
          </div>

          <div className="add-field">
            <label htmlFor="add-manufacture-date">
              NSX
              <span className="required-mark">*</span>
            </label>

            <input
              id="add-manufacture-date"
              type="text"
              inputMode="numeric"
              value={manufactureDate}
              onChange={(event) =>
                setManufactureDate(event.target.value)
              }
              onBlur={() =>
                setManufactureDate(
                  normalizeVietnamDateInput(manufactureDate)
                )
              }
              placeholder="DD/MM/YYYY"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="add-field">
            <label htmlFor="add-expiry-date">
              HSD
              <span className="required-mark">*</span>
            </label>

            <input
              id="add-expiry-date"
              type="text"
              inputMode="numeric"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
              onBlur={() =>
                setExpiryDate(normalizeVietnamDateInput(expiryDate))
              }
              placeholder="DD/MM/YYYY"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="add-field">
            <label htmlFor="add-reminder-date">
              Ngày báo lại
            </label>

            <input
              id="add-reminder-date"
              type="text"
              inputMode="numeric"
              value={reminderDate}
              onChange={(event) =>
                setReminderDate(event.target.value)
              }
              onBlur={() =>
                setReminderDate(
                  normalizeVietnamDateInput(reminderDate)
                )
              }
              placeholder="DD/MM/YYYY"
              disabled={loading}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="add-product-row-two">
          <div className="add-field">
            <label htmlFor="add-note">
              Note
            </label>

            <input
              id="add-note"
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note ngắn..."
              disabled={loading}
            />
          </div>

          <div className="add-field">
            <label htmlFor="add-description">
              Ghi chú
            </label>

            <input
              id="add-description"
              type="text"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value)
              }
              placeholder="Ghi chú nếu có..."
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="kk-button-primary add-product-submit"
            disabled={loading}
          >
            {loading ? "Đang thêm..." : "Thêm sản phẩm"}
          </button>
        </div>

        {error && (
          <div className="add-message add-message-error">
            {error}
          </div>
        )}

        {success && (
          <div className="add-message add-message-success">
            {success}
          </div>
        )}
      </form>

      <style jsx>{`
        .add-product-section {
          overflow: visible;
        }

        .add-product-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .add-product-badge {
          padding: 6px 10px;
          border-radius: 999px;
          background: var(--kk-red-soft);
          color: var(--kk-red);
          font-weight: 800;
          font-size: 12px;
        }

        .add-product-row-one {
          display: grid;
          grid-template-columns:
            minmax(180px, 0.9fr)
            minmax(360px, 2fr)
            minmax(90px, 0.55fr)
            minmax(160px, 0.85fr)
            minmax(160px, 0.85fr)
            minmax(170px, 0.9fr);
          gap: 14px;
          align-items: start;
        }

        .add-product-row-two {
          display: grid;
          grid-template-columns:
            minmax(220px, 0.8fr)
            minmax(520px, 2.4fr)
            auto;
          gap: 14px;
          align-items: end;
          margin-top: 16px;
        }

        .add-field {
          min-width: 0;
        }

        .add-field label,
        .field-label {
          display: block;
          margin-bottom: 6px;
          font-weight: 700;
        }

        .required-mark {
          color: var(--kk-red);
          margin-left: 4px;
        }

        .add-field input {
          width: 100%;
        }

        .product-name-display {
          width: 100%;
          min-height: 40px;
          padding: 8px 11px;
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm);
          background: #f4f6f8;
          color: var(--text-muted);
          font-weight: 400;
          line-height: 1.35;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .product-name-display.has-product {
          background: #f7fff9;
          color: var(--foreground);
          font-weight: 700;
        }

        .field-help {
          margin-top: 4px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .product-suggestions {
          position: relative;
          z-index: 20;
          width: min(520px, 70vw);
          max-height: 300px;
          margin-top: 6px;
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: var(--shadow-md);
        }

        .product-suggestion-item {
          display: block;
          width: 100%;
          min-height: 54px;
          padding: 8px 12px;
          text-align: left;
          background: #ffffff;
          border: 0;
          border-bottom: 1px solid #edf0f2;
          border-radius: 0;
          cursor: pointer;
        }

        .suggestion-code {
          font-weight: 800;
          color: var(--foreground);
        }

        .suggestion-name {
          margin-top: 2px;
          font-size: 12px;
          font-weight: 400;
          color: var(--text-secondary);
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .add-product-submit {
          min-width: 150px;
          min-height: 40px;
          white-space: nowrap;
        }

        .add-message {
          margin-top: 14px;
          padding: 10px 12px;
          border-radius: 8px;
          font-weight: 700;
        }

        .add-message-error {
          border: 1px solid #f1b5b5;
          background: var(--danger-soft);
          color: var(--danger);
        }

        .add-message-success {
          border: 1px solid #acd7ba;
          background: var(--success-soft);
          color: var(--success);
        }

        @media (max-width: 1180px) {
          .add-product-row-one {
            grid-template-columns:
              minmax(180px, 1fr)
              minmax(280px, 1.7fr)
              minmax(100px, 0.55fr);
          }

          .add-product-row-two {
            grid-template-columns:
              minmax(180px, 0.8fr)
              minmax(320px, 1.7fr)
              auto;
          }
        }

        @media (max-width: 760px) {
          .add-product-section {
            padding: 14px;
          }

          .add-product-heading {
            align-items: flex-start;
            gap: 10px;
            margin-bottom: 14px;
          }

          .add-product-heading h2 {
            font-size: 19px;
          }

          .add-product-heading p {
            font-size: 12px;
            line-height: 1.45;
          }

          .add-product-badge {
            padding: 5px 9px;
            font-size: 10px;
          }

          .add-product-row-one {
            grid-template-columns:
              minmax(0, 1fr)
              minmax(0, 1fr);
            gap: 11px 10px;
          }

          .add-field-code,
          .add-field-name {
            grid-column: 1 / -1;
          }

          .add-product-row-two {
            grid-template-columns: 1fr;
            gap: 11px;
            margin-top: 11px;
          }

          .add-product-submit {
            width: 100%;
            min-height: 44px;
          }

          .product-suggestions {
            width: 100%;
            max-width: 100%;
            max-height: 240px;
          }

          .add-product-form input,
          .add-product-form button {
            font-size: 16px;
          }

          .add-product-form input {
            min-height: 42px;
          }

          .product-name-display {
            min-height: 42px;
          }
        }

        @media (max-width: 380px) {
          .add-product-row-one {
            grid-template-columns: 1fr;
          }

          .add-field-code,
          .add-field-name {
            grid-column: auto;
          }
        }
      `}</style>
    </section>
  );
}
