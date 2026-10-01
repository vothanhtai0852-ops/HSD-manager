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

  // ====================================================
  // PRODUCT SEARCH
  // Chỉ tìm khi mã có từ 6 ký tự trở lên.
  // ====================================================

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

  // ====================================================
  // SUBMIT
  // ====================================================

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

      window.setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Không thể thêm sản phẩm."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "18px",
        }}
      >
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

        <div
          style={{
            padding: "6px 10px",
            borderRadius: "999px",
            background: "var(--kk-red-soft)",
            color: "var(--kk-red)",
            fontWeight: 800,
            fontSize: "12px",
          }}
        >
          AUTO CHECK
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* =================================================
            HÀNG 1
            Mã SP | Tên SP | SL | NSX | HSD | Ngày báo lại
        ================================================= */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(180px,0.9fr) minmax(360px,2fr) minmax(90px,0.55fr) minmax(160px,0.85fr) minmax(160px,0.85fr) minmax(170px,0.9fr)",
            gap: "14px",
            alignItems: "start",
          }}
        >
          {/* MÃ SẢN PHẨM */}

          <div style={{ minWidth: 0 }}>
            <label
              htmlFor="add-product-code"
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
              Mã sản phẩm
              <span
                style={{
                  color: "var(--kk-red)",
                  marginLeft: "4px",
                }}
              >
                *
              </span>
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
              style={{
                width: "100%",
              }}
            />

            {productCode.trim().length >= 6 && productSearchLoading && (
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                Đang tìm sản phẩm...
              </div>
            )}

            {productSuggestions.length > 0 && (
              <div
                style={{
                  marginTop: "6px",
                  width: "520px",
                  maxWidth: "70vw",
                  maxHeight: "300px",
                  overflowY: "auto",
                  background: "#ffffff",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  boxShadow: "var(--shadow-md)",
                  position: "relative",
                  zIndex: 20,
                }}
              >
                {productSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectProduct(item)}
                    style={{
                      display: "block",
                      width: "100%",
                      minHeight: "54px",
                      padding: "8px 12px",
                      textAlign: "left",
                      background: "#ffffff",
                      border: 0,
                      borderBottom: "1px solid #edf0f2",
                      borderRadius: 0,
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: "var(--foreground)",
                      }}
                    >
                      {item.productCode}
                    </div>

                    <div
                      style={{
                        marginTop: "2px",
                        fontSize: "12px",
                        fontWeight: 400,
                        color: "var(--text-secondary)",
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                      }}
                    >
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
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "11px",
                    color: "var(--text-muted)",
                  }}
                >
                  Không tìm thấy mã phù hợp.
                </div>
              )}
          </div>

          {/* TÊN SẢN PHẨM */}

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
              Tên sản phẩm
            </div>

            <div
              title={productName || ""}
              style={{
                width: "100%",
                minHeight: "40px",
                padding: "8px 11px",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                background: productName ? "#f7fff9" : "#f4f6f8",
                color: productName
                  ? "var(--foreground)"
                  : "var(--text-muted)",
                fontWeight: productName ? 700 : 400,
                lineHeight: 1.35,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
              }}
            >
              {productName || "Tự động theo mã SP"}
            </div>
          </div>

          {/* SỐ LƯỢNG */}

          <div>
            <label
              htmlFor="add-quantity"
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
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
              style={{
                width: "100%",
              }}
            />
          </div>

          {/* NSX */}

          <div>
            <label
              htmlFor="add-manufacture-date"
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
              NSX
              <span
                style={{
                  color: "var(--kk-red)",
                  marginLeft: "4px",
                }}
              >
                *
              </span>
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
              style={{
                width: "100%",
              }}
            />
          </div>

          {/* HSD */}

          <div>
            <label
              htmlFor="add-expiry-date"
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
              HSD
              <span
                style={{
                  color: "var(--kk-red)",
                  marginLeft: "4px",
                }}
              >
                *
              </span>
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
              style={{
                width: "100%",
              }}
            />
          </div>

          {/* NGÀY BÁO LẠI */}

          <div>
            <label
              htmlFor="add-reminder-date"
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
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
              style={{
                width: "100%",
              }}
            />
          </div>
        </div>

        {/* =================================================
            HÀNG 2
            Note | Ghi chú | Nút thêm
        ================================================= */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(220px,0.8fr) minmax(520px,2.4fr) auto",
            gap: "14px",
            alignItems: "end",
            marginTop: "16px",
          }}
        >
          {/* NOTE */}

          <div>
            <label
              htmlFor="add-note"
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
              Note
            </label>

            <input
              id="add-note"
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note ngắn..."
              disabled={loading}
              style={{
                width: "100%",
              }}
            />
          </div>

          {/* GHI CHÚ */}

          <div>
            <label
              htmlFor="add-description"
              style={{
                display: "block",
                marginBottom: "6px",
                fontWeight: 700,
              }}
            >
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
              style={{
                width: "100%",
              }}
            />
          </div>

          {/* SUBMIT */}

          <button
            type="submit"
            className="kk-button-primary"
            disabled={loading}
            style={{
              minWidth: "150px",
              minHeight: "40px",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "Đang thêm..." : "Thêm sản phẩm"}
          </button>
        </div>

        {/* MESSAGE */}

        {error && (
          <div
            style={{
              marginTop: "14px",
              padding: "10px 12px",
              border: "1px solid #f1b5b5",
              borderRadius: "8px",
              background: "var(--danger-soft)",
              color: "var(--danger)",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              marginTop: "14px",
              padding: "10px 12px",
              border: "1px solid #acd7ba",
              borderRadius: "8px",
              background: "var(--success-soft)",
              color: "var(--success)",
              fontWeight: 700,
            }}
          >
            {success}
          </div>
        )}
      </form>
    </section>
  );
}
