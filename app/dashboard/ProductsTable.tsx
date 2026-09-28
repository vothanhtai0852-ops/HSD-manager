"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
} from "react";

import ProductActions from "./ProductActions";

type ProductStatus =
  | "BINH_THUONG"
  | "CANH_BAO"
  | "BAO_LAI"
  | "DA_BAO"
  | "LOI";

type Product = {
  id: string;

  product_code: string;
  product_name: string;

  quantity: number;

  manufacture_date: string | null;
  expiry_date: string | null;
  reminder_date: string | null;

  note: string | null;
  description: string | null;

  sale_price: number | null;

  alert_sent: boolean;

  threshold_percent: number;
  percent_remaining: number | null;
  status: ProductStatus;

  owner: {
    username: string;
    display_name: string | null;
  } | null;
};

type ProductsResponse = {
  success: boolean;

  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };

  products: Product[];
};

export default function ProductsTable() {
  // =========================
  // DATA
  // =========================

  const [products, setProducts] =
    useState<Product[]>([]);

  const [total, setTotal] =
    useState(0);

  // =========================
  // PAGINATION
  // =========================

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(30);

  const [totalPages, setTotalPages] =
    useState(1);

  // =========================
  // SEARCH
  // =========================

  const [search, setSearch] =
    useState("");

  // =========================
  // REFRESH
  // =========================

  const [refreshKey, setRefreshKey] =
    useState(0);

  // =========================
  // UI
  // =========================

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // =========================
  // LOAD PRODUCTS
  // =========================

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadProducts() {
      try {
        setLoading(true);
        setError("");

        const params =
          new URLSearchParams({
            page: String(page),
            pageSize:
              String(pageSize),
          });

        if (search.trim()) {
          params.set(
            "search",
            search.trim()
          );
        }

        const response =
          await fetch(
            `/api/products?${params.toString()}`,
            {
              signal:
                controller.signal,

              cache:
                "no-store",
            }
          );

        const data =
          (await response.json()) as
            | ProductsResponse
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in data &&
              data.error
              ? data.error
              : "Không thể tải danh sách sản phẩm."
          );
        }

        const result =
          data as ProductsResponse;

        setProducts(
          result.products ?? []
        );

        setTotal(
          result.pagination.total ??
            0
        );

        setTotalPages(
          result.pagination
            .totalPages ?? 0
        );
      } catch (err) {
        if (
          err instanceof Error &&
          err.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "LOAD_PRODUCTS_ERROR:",
          err
        );

        setProducts([]);
        setTotal(0);
        setTotalPages(0);

        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách sản phẩm."
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      controller.abort();
    };
  }, [
    page,
    pageSize,
    search,
    refreshKey,
  ]);

  // =========================
  // REFRESH TABLE
  // =========================

  function refreshProducts() {
    setRefreshKey(
      (current) => current + 1
    );
  }

  // =========================
  // FORMAT DATE
  // =========================

  function formatDate(
    value: string | null
  ) {
    if (!value) {
      return "-";
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

  // =========================
  // FORMAT PRICE
  // =========================

  function formatPrice(
    value: number | null
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return "-";
    }

    return value.toLocaleString(
      "vi-VN"
    );
  }

  // =========================
  // FORMAT PERCENT
  // =========================

  function formatPercent(
    value: number | null
  ) {
    if (
      value === null ||
      value === undefined
    ) {
      return "-";
    }

    return `${value.toLocaleString(
      "vi-VN",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }
    )}%`;
  }

  // =========================
  // STATUS
  // =========================

  function getStatusLabel(
    status: ProductStatus
  ) {
    switch (status) {
      case "BINH_THUONG":
        return "BÌNH THƯỜNG";

      case "CANH_BAO":
        return "CẢNH BÁO";

      case "BAO_LAI":
        return "BÁO LẠI";

      case "DA_BAO":
        return "ĐÃ BÁO";

      case "LOI":
        return "LỖI";

      default:
        return status;
    }
  }

  // =========================
  // SEARCH
  // =========================

  function handleSearchChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setSearch(
      event.target.value
    );

    setPage(1);
  }

  // =========================
  // PAGE SIZE
  // =========================

  function handlePageSizeChange(
    event: ChangeEvent<HTMLSelectElement>
  ) {
    setPageSize(
      Number(
        event.target.value
      )
    );

    setPage(1);
  }

  // =========================
  // RENDER
  // =========================

  return (
    <section>
      <h2>
        Danh sách sản phẩm
      </h2>

      {/* SEARCH */}

      <div>
        <label htmlFor="product-search">
          Tìm kiếm:{" "}
        </label>

        <input
          id="product-search"
          type="search"
          placeholder="Nhập mã SP hoặc tên sản phẩm..."
          value={search}
          onChange={
            handleSearchChange
          }
        />
      </div>

      <br />

      {/* TOTAL */}

      <p>
        Tổng sản phẩm:{" "}
        <strong>
          {total}
        </strong>
      </p>

      {search.trim() && (
        <p>
          Kết quả tìm kiếm cho:{" "}
          <strong>
            {search}
          </strong>
        </p>
      )}

      {/* ERROR */}

      {error && (
        <p>
          <strong>
            {error}
          </strong>
        </p>
      )}

      {/* LOADING */}

      {loading && (
        <p>
          Đang tải sản phẩm...
        </p>
      )}

      {/* TABLE */}

      {!error && (
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table>
            <thead>
              <tr>
                <th>Mã SP</th>

                <th>
                  Tên sản phẩm
                </th>

                <th>
                  Người dùng
                </th>

                <th>NSX</th>

                <th>HSD</th>

                <th>% HSD</th>

                <th>Ngưỡng</th>

                <th>
                  Ngày báo lại
                </th>

                <th>
                  Trạng thái
                </th>

                <th>
                  Số lượng
                </th>

                <th>
                  Giá bán
                </th>

                <th>
                  Thao tác
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
              products.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={12}
                  >
                    Không tìm thấy sản phẩm.
                  </td>
                </tr>
              ) : (
                products.map(
                  (product) => (
                    <tr
                      key={
                        product.id
                      }
                    >
                      <td>
                        {
                          product.product_code
                        }
                      </td>

                      <td>
                        {
                          product.product_name
                        }
                      </td>

                      <td>
                        {product
                          .owner
                          ?.display_name ||
                          product
                            .owner
                            ?.username ||
                          "-"}
                      </td>

                      <td>
                        {formatDate(
                          product.manufacture_date
                        )}
                      </td>

                      <td>
                        {formatDate(
                          product.expiry_date
                        )}
                      </td>

                      <td>
                        {formatPercent(
                          product.percent_remaining
                        )}
                      </td>

                      <td>
                        {formatPercent(
                          product.threshold_percent
                        )}
                      </td>

                      <td>
                        {formatDate(
                          product.reminder_date
                        )}
                      </td>

                      <td>
                        <strong>
                          {getStatusLabel(
                            product.status
                          )}
                        </strong>
                      </td>

                      <td>
                        {
                          product.quantity
                        }
                      </td>

                      <td>
                        {formatPrice(
                          product.sale_price
                        )}
                      </td>

                      <td>
                        <ProductActions
                          product={
                            product
                          }
                          onChanged={
                            refreshProducts
                          }
                        />
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <br />

      {/* PAGINATION */}

      <div>
        <label htmlFor="page-size">
          Hiển thị:{" "}
        </label>

        <select
          id="page-size"
          value={pageSize}
          onChange={
            handlePageSizeChange
          }
          disabled={loading}
        >
          <option value={10}>
            10
          </option>

          <option value={20}>
            20
          </option>

          <option value={30}>
            30
          </option>

          <option value={50}>
            50
          </option>

          <option value={100}>
            100
          </option>
        </select>

        <span>
          {" "}
          dòng / trang{" "}
        </span>

        <button
          type="button"
          onClick={() =>
            setPage(
              (current) =>
                Math.max(
                  1,
                  current - 1
                )
            )
          }
          disabled={
            loading ||
            page <= 1 ||
            totalPages === 0
          }
        >
          Trang trước
        </button>

        <span>
          {" "}
          Trang{" "}
          <strong>
            {page}
          </strong>{" "}
          /{" "}
          <strong>
            {totalPages}
          </strong>{" "}
        </span>

        <button
          type="button"
          onClick={() =>
            setPage(
              (current) =>
                Math.min(
                  totalPages,
                  current + 1
                )
            )
          }
          disabled={
            loading ||
            totalPages === 0 ||
            page >= totalPages
          }
        >
          Trang sau
        </button>
      </div>
    </section>
  );
}