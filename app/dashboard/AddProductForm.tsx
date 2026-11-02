"use client";

import {
  useEffect,
  useRef,
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
  const [isCodeFocused, setIsCodeFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const catalogCache = useRef(new Map<string, { items: CatalogItem[]; savedAt: number }>());
  const selectedCode = useRef("");

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
    const query = productCode.trim().toLowerCase();

    // Người dùng đã chọn gợi ý: giữ tên SP, không tìm lại hoặc xóa tên.
    if (selectedCode.current === query && query) {
      queueMicrotask(() => setProductSearchLoading(false));
      return;
    }

    // Microtask giúp cập nhật tức thì mà không render đồng bộ trong effect.
    queueMicrotask(() => {
      setProductName("");
      setProductSearchDone(false);
      setActiveSuggestionIndex(0);
    });

    if (query.length < 2) {
      queueMicrotask(() => {
        setProductSuggestions([]);
        setProductSearchLoading(false);
      });
      return;
    }

    const controller = new AbortController();
    const cached = catalogCache.current.get(query);
    const now = Date.now();

    // Kết quả đã tải được hiển thị ngay; không đợi debounce hoặc gọi lại API.
    if (cached && now - cached.savedAt < 120_000) {
      const exact = cached.items.find(
        (item) => item.productCode.trim().toLowerCase() === query
      );
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setProductSuggestions(cached.items);
        setProductSearchDone(true);
        setProductSearchLoading(false);
        if (exact) setProductName(exact.productName || "");
      });
      return;
    }

    // Tạm lọc ngay dữ liệu gợi ý đã có trong cache trong lúc chờ API.
    const seen = new Set<string>();
    const localItems = [...catalogCache.current.values()]
      .flatMap((entry) => entry.items)
      .filter((item) => {
        const code = item.productCode.toLowerCase();
        if (!code.includes(query) || seen.has(code)) return false;
        seen.add(code);
        return true;
      })
      .slice(0, 10);
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setProductSuggestions(localItems);
        setProductSearchLoading(true);
      }
    });

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/catalog/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal, cache: "no-store" }
        );
        if (!response.ok) throw new Error("Không thể tra cứu mã sản phẩm.");
        const data = await response.json();
        if (controller.signal.aborted) return;
        const items: CatalogItem[] = Array.isArray(data.items) ? data.items : [];
        // Tránh tăng RAM vô hạn khi làm việc nhiều mã trong một phiên.
        if (catalogCache.current.size >= 100) {
          const oldest = catalogCache.current.keys().next().value;
          if (oldest !== undefined) catalogCache.current.delete(oldest);
        }
        catalogCache.current.set(query, { items, savedAt: Date.now() });
        setProductSuggestions(items);
        const exact = items.find(
          (item) => item.productCode.trim().toLowerCase() === query
        );
        setProductName(exact?.productName || "");
        setProductSearchDone(true);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("PRODUCT_SEARCH_ERROR:", err);
        // Giữ gợi ý cục bộ nếu mạng lỗi, không xóa kết quả đang hiển thị.
        setProductSearchDone(false);
      } finally {
        if (!controller.signal.aborted) setProductSearchLoading(false);
      }
    }, 80);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [productCode]);

  function selectProduct(item: CatalogItem) {
    selectedCode.current = item.productCode.trim().toLowerCase();
    setProductCode(item.productCode);
    setProductName(item.productName || "");
    setProductSuggestions([]);
    setProductSearchDone(true);
    setActiveSuggestionIndex(0);
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

      selectedCode.current = "";
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
                selectedCode.current = "";
                setProductCode(event.target.value);
                setProductName("");
              }}
              onFocus={() => setIsCodeFocused(true)}
              onBlur={() => setIsCodeFocused(false)}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isCodeFocused && productSuggestions.length > 0}
              aria-controls="product-code-suggestion-list"
              aria-activedescendant={isCodeFocused && productSuggestions.length > 0
                ? `product-code-option-${activeSuggestionIndex}` : undefined}
              onKeyDown={(event) => {
                if (!isCodeFocused || productSuggestions.length === 0) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSuggestionIndex((index) => (index + 1) % productSuggestions.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSuggestionIndex((index) => (index - 1 + productSuggestions.length) % productSuggestions.length);
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  selectProduct(productSuggestions[activeSuggestionIndex] ?? productSuggestions[0]);
                } else if (event.key === "Escape") {
                  event.currentTarget.blur();
                }
              }}
              placeholder="Nhập mã SP"
              disabled={loading}
              autoComplete="off"
            />

            {isCodeFocused && productCode.trim().length >= 2 && productSearchLoading && productSuggestions.length === 0 && (
              <div className="field-help">
                Đang tìm sản phẩm...
              </div>
            )}

            {isCodeFocused && productSuggestions.length > 0 && (
              <div id="product-code-suggestion-list" role="listbox" className="product-suggestions">
                {productSuggestions.map((item, index) => (
                  <button
                    key={item.id}
                    id={`product-code-option-${index}`}
                    role="option"
                    aria-selected={index === activeSuggestionIndex}
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => selectProduct(item)}
                    className={`product-suggestion-item ${index === activeSuggestionIndex ? "is-active" : ""}`}
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

            {isCodeFocused && productCode.trim().length >= 2 &&
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
              inputMode="text"
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
              inputMode="text"
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
              inputMode="text"
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

        .product-suggestion-item.is-active,
        .product-suggestion-item:hover {
          background: #fff1f2;
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
