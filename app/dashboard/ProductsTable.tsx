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


type SortOption =
  | "NEWEST"
  | "TEN_ASC"
  | "TEN_DESC"
  | "PERCENT_ASC"
  | "PERCENT_DESC"
  | "HSD_ASC"
  | "HSD_DESC";


type Product = {
  id: string;
  user_id: string;

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


type FilterUser = {
  id: string;
  username: string;
  display_name: string | null;
  role: string;
  active: boolean;
};


type DashboardStats = {
  totalProducts: number;
  warningProducts: number;
  reminderProducts: number;
  addedTodayProducts: number;
};


type ProductsResponse = {
  success: boolean;

  user: {
    id: string;
    username: string;
    role: string;
  };

  stats: DashboardStats;

  filterUsers: FilterUser[];

  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };

  products: Product[];
};


const EMPTY_STATS: DashboardStats = {
  totalProducts: 0,
  warningProducts: 0,
  reminderProducts: 0,
  addedTodayProducts: 0,
};


export default function ProductsTable() {
  // ====================================================
  // DATA
  // ====================================================

  const [
    products,
    setProducts,
  ] = useState<Product[]>([]);


  const [
    filterUsers,
    setFilterUsers,
  ] = useState<FilterUser[]>([]);


  const [
    stats,
    setStats,
  ] =
    useState<DashboardStats>(
      EMPTY_STATS
    );


  const [
    total,
    setTotal,
  ] = useState(0);


  // ====================================================
  // PAGINATION
  // ====================================================

  const [
    page,
    setPage,
  ] = useState(1);


  const [
    pageSize,
    setPageSize,
  ] = useState(30);


  const [
    totalPages,
    setTotalPages,
  ] = useState(0);


  // ====================================================
  // SEARCH
  // ====================================================

  const [
    search,
    setSearch,
  ] = useState("");


  // ====================================================
  // FILTER
  // ====================================================

  const [
    userFilter,
    setUserFilter,
  ] = useState("");


  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");


  // ====================================================
  // SORT
  // ====================================================

  const [
    sort,
    setSort,
  ] =
    useState<SortOption>(
      "NEWEST"
    );


  // ====================================================
  // REFRESH
  // ====================================================

  const [
    refreshKey,
    setRefreshKey,
  ] = useState(0);


  // ====================================================
  // UI
  // ====================================================

  const [
    loading,
    setLoading,
  ] = useState(true);


  const [
    error,
    setError,
  ] = useState("");


  // ====================================================
  // LOAD PRODUCTS
  // ====================================================

  useEffect(() => {
    const controller =
      new AbortController();


    async function loadProducts() {
      try {
        setLoading(true);
        setError("");


        const params =
          new URLSearchParams({
            page:
              String(page),

            pageSize:
              String(pageSize),

            sort,
          });


        if (search.trim()) {
          params.set(
            "search",
            search.trim()
          );
        }


        if (userFilter) {
          params.set(
            "userId",
            userFilter
          );
        }


        if (statusFilter) {
          params.set(
            "status",
            statusFilter
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
          (
            await response.json()
          ) as
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
          result.products ??
            []
        );


        setFilterUsers(
          result.filterUsers ??
            []
        );


        setStats(
          result.stats ??
            EMPTY_STATS
        );


        setTotal(
          result.pagination
            .total ??
            0
        );


        setTotalPages(
          result.pagination
            .totalPages ??
            0
        );


        if (
          result.pagination.page !==
          page
        ) {
          setPage(
            result.pagination.page
          );
        }
      } catch (err) {
        if (
          err instanceof Error &&
          err.name ===
            "AbortError"
        ) {
          return;
        }


        console.error(
          "LOAD_PRODUCTS_ERROR:",
          err
        );


        setProducts([]);

        setFilterUsers([]);

        setStats(
          EMPTY_STATS
        );

        setTotal(0);

        setTotalPages(0);


        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách sản phẩm."
        );
      } finally {
        if (
          !controller
            .signal
            .aborted
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
    userFilter,
    statusFilter,
    sort,
    refreshKey,
  ]);


  // ====================================================
  // REFRESH
  // ====================================================

  function refreshProducts() {
    setRefreshKey(
      (current) =>
        current + 1
    );
  }


  // ====================================================
  // FORMAT DATE
  // ====================================================

  function formatDate(
    value: string | null
  ) {
    if (!value) {
      return "-";
    }


    const parts =
      value.split("-");


    if (
      parts.length !== 3
    ) {
      return value;
    }


    const [
      year,
      month,
      day,
    ] = parts;


    return `${day}/${month}/${year}`;
  }


  // ====================================================
  // FORMAT PRICE
  // ====================================================

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


  // ====================================================
  // FORMAT PERCENT
  // ====================================================

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
        minimumFractionDigits:
          0,

        maximumFractionDigits:
          2,
      }
    )}%`;
  }


  // ====================================================
  // STATUS LABEL
  // ====================================================

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


  // ====================================================
  // SEARCH
  // ====================================================

  function handleSearchChange(
    event:
      ChangeEvent<HTMLInputElement>
  ) {
    /*
     * Không debounce.
     * Gõ tới đâu tìm tới đó.
     */

    setSearch(
      event.target.value
    );

    setPage(1);
  }


  // ====================================================
  // USER FILTER
  // ====================================================

  function handleUserFilterChange(
    event:
      ChangeEvent<HTMLSelectElement>
  ) {
    setUserFilter(
      event.target.value
    );

    setPage(1);
  }


  // ====================================================
  // STATUS FILTER
  // ====================================================

  function handleStatusFilterChange(
    event:
      ChangeEvent<HTMLSelectElement>
  ) {
    setStatusFilter(
      event.target.value
    );

    setPage(1);
  }


  // ====================================================
  // SORT
  // ====================================================

  function handleSortChange(
    event:
      ChangeEvent<HTMLSelectElement>
  ) {
    setSort(
      event.target
        .value as SortOption
    );

    setPage(1);
  }


  // ====================================================
  // PAGE SIZE
  // ====================================================

  function handlePageSizeChange(
    event:
      ChangeEvent<HTMLSelectElement>
  ) {
    setPageSize(
      Number(
        event.target.value
      )
    );

    setPage(1);
  }


  // ====================================================
  // RENDER
  // ====================================================

  return (
    <section>
      <h2>
        Danh sách sản phẩm
      </h2>


      {/* =================================================
          DASHBOARD STATS
      ================================================== */}

      <div
        style={{
          display:
            "grid",

          gridTemplateColumns:
            "repeat(auto-fit, minmax(180px, 1fr))",

          gap:
            "12px",

          marginBottom:
            "20px",
        }}
      >
        <div>
          <strong>
            Tổng sản phẩm
          </strong>

          <div>
            {stats.totalProducts}
          </div>
        </div>


        <div>
          <strong>
            Cảnh báo
          </strong>

          <div>
            {stats.warningProducts}
          </div>
        </div>


        <div>
          <strong>
            Báo lại
          </strong>

          <div>
            {stats.reminderProducts}
          </div>
        </div>


        <div>
          <strong>
            Sản phẩm đã thêm trong ngày
          </strong>

          <div>
            {
              stats.addedTodayProducts
            }
          </div>
        </div>
      </div>


      {/* =================================================
          SEARCH
      ================================================== */}

      <div>
        <label htmlFor="product-search">
          Tìm kiếm:{" "}
        </label>

        <input
          id="product-search"
          type="search"
          placeholder="Mã SP, tên SP, note hoặc ghi chú..."
          value={search}
          onChange={
            handleSearchChange
          }
        />
      </div>


      <br />


      {/* =================================================
          FILTERS
      ================================================== */}

      <div
        style={{
          display:
            "flex",

          flexWrap:
            "wrap",

          gap:
            "12px",
        }}
      >
        {/* USER FILTER */}

        {filterUsers.length >
          1 && (
          <div>
            <label htmlFor="product-user-filter">
              Người dùng:{" "}
            </label>

            <select
              id="product-user-filter"
              value={
                userFilter
              }
              onChange={
                handleUserFilterChange
              }
              disabled={
                loading
              }
            >
              <option value="">
                Tất cả
              </option>

              {filterUsers.map(
                (user) => (
                  <option
                    key={
                      user.id
                    }
                    value={
                      user.id
                    }
                  >
                    {user.display_name ||
                      user.username}
                  </option>
                )
              )}
            </select>
          </div>
        )}


        {/* STATUS FILTER */}

        <div>
          <label htmlFor="product-status-filter">
            Trạng thái:{" "}
          </label>

          <select
            id="product-status-filter"
            value={
              statusFilter
            }
            onChange={
              handleStatusFilterChange
            }
            disabled={
              loading
            }
          >
            <option value="">
              Tất cả
            </option>

            <option value="BINH_THUONG">
              Bình thường
            </option>

            <option value="CANH_BAO">
              Cảnh báo
            </option>

            <option value="BAO_LAI">
              Báo lại
            </option>

            <option value="DA_BAO">
              Đã báo
            </option>

            <option value="LOI">
              Lỗi
            </option>
          </select>
        </div>


        {/* SORT */}

        <div>
          <label htmlFor="product-sort">
            Sắp xếp:{" "}
          </label>

          <select
            id="product-sort"
            value={
              sort
            }
            onChange={
              handleSortChange
            }
            disabled={
              loading
            }
          >
            <option value="NEWEST">
              Mới nhất
            </option>

            <option value="TEN_ASC">
              Tên A → Z
            </option>

            <option value="TEN_DESC">
              Tên Z → A
            </option>

            <option value="PERCENT_ASC">
              % HSD thấp → cao
            </option>

            <option value="PERCENT_DESC">
              % HSD cao → thấp
            </option>

            <option value="HSD_ASC">
              HSD gần → xa
            </option>

            <option value="HSD_DESC">
              HSD xa → gần
            </option>
          </select>
        </div>
      </div>


      <br />


      {/* =================================================
          RESULT COUNT
      ================================================== */}

      <p>
        Kết quả:{" "}

        <strong>
          {total}
        </strong>{" "}

        sản phẩm
      </p>


      {search.trim() && (
        <p>
          Tìm kiếm:{" "}

          <strong>
            {search}
          </strong>
        </p>
      )}


      {/* =================================================
          ERROR
      ================================================== */}

      {error && (
        <p>
          <strong>
            {error}
          </strong>
        </p>
      )}


      {/* =================================================
          LOADING
      ================================================== */}

      {loading && (
        <p>
          Đang tải sản phẩm...
        </p>
      )}


      {/* =================================================
          TABLE
      ================================================== */}

      {!error && (
        <div
          style={{
            overflowX:
              "auto",

            width:
              "100%",
          }}
        >
          <table
            cellPadding={8}
            style={{
              width:
                "100%",

              minWidth:
                "1500px",

              borderCollapse:
                "collapse",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    textAlign:
                      "left",

                    minWidth:
                      "130px",
                  }}
                >
                  Mã SP
                </th>


                <th
                  style={{
                    textAlign:
                      "left",

                    minWidth:
                      "260px",
                  }}
                >
                  Tên sản phẩm
                </th>


                <th
                  style={{
                    textAlign:
                      "left",

                    minWidth:
                      "110px",
                  }}
                >
                  Người dùng
                </th>


                <th
                  style={{
                    minWidth:
                      "100px",
                  }}
                >
                  NSX
                </th>


                <th
                  style={{
                    minWidth:
                      "100px",
                  }}
                >
                  HSD
                </th>


                <th
                  style={{
                    minWidth:
                      "85px",
                  }}
                >
                  % HSD
                </th>


                <th
                  style={{
                    minWidth:
                      "80px",
                  }}
                >
                  Ngưỡng
                </th>


                <th
                  style={{
                    minWidth:
                      "110px",
                  }}
                >
                  Ngày báo lại
                </th>


                <th
                  style={{
                    minWidth:
                      "110px",
                  }}
                >
                  Trạng thái
                </th>


                <th
                  style={{
                    minWidth:
                      "80px",
                  }}
                >
                  Số lượng
                </th>


                <th
                  style={{
                    minWidth:
                      "100px",
                  }}
                >
                  Giá bán
                </th>


                <th
                  style={{
                    textAlign:
                      "left",

                    minWidth:
                      "160px",
                  }}
                >
                  Note
                </th>


                <th
                  style={{
                    textAlign:
                      "left",

                    minWidth:
                      "180px",
                  }}
                >
                  Ghi chú
                </th>


                <th
                  style={{
                    minWidth:
                      "120px",
                  }}
                >
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
                    colSpan={14}
                    style={{
                      textAlign:
                        "center",

                      padding:
                        "24px",
                    }}
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
                      {/* MÃ SP */}

                      <td>
                        {
                          product
                            .product_code
                        }
                      </td>


                      {/* TÊN SP */}

                      <td>
                        {
                          product
                            .product_name
                        }
                      </td>


                      {/* USER */}

                      <td>
                        {product
                          .owner
                          ?.display_name ||
                          product
                            .owner
                            ?.username ||
                          "-"}
                      </td>


                      {/* NSX */}

                      <td
                        style={{
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {formatDate(
                          product
                            .manufacture_date
                        )}
                      </td>


                      {/* HSD */}

                      <td
                        style={{
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {formatDate(
                          product
                            .expiry_date
                        )}
                      </td>


                      {/* % HSD */}

                      <td
                        style={{
                          whiteSpace:
                            "nowrap",

                          textAlign:
                            "center",
                        }}
                      >
                        {formatPercent(
                          product
                            .percent_remaining
                        )}
                      </td>


                      {/* NGƯỠNG */}

                      <td
                        style={{
                          whiteSpace:
                            "nowrap",

                          textAlign:
                            "center",
                        }}
                      >
                        {formatPercent(
                          product
                            .threshold_percent
                        )}
                      </td>


                      {/* NGÀY BÁO LẠI */}

                      <td
                        style={{
                          whiteSpace:
                            "nowrap",
                        }}
                      >
                        {formatDate(
                          product
                            .reminder_date
                        )}
                      </td>


                      {/* TRẠNG THÁI */}

                      <td>
                        <strong>
                          {getStatusLabel(
                            product.status
                          )}
                        </strong>
                      </td>


                      {/* SỐ LƯỢNG */}

                      <td
                        style={{
                          textAlign:
                            "center",
                        }}
                      >
                        {
                          product
                            .quantity
                        }
                      </td>


                      {/* GIÁ BÁN */}

                      <td
  style={{
    whiteSpace: "nowrap",
    textAlign: "right",
    minWidth: "110px",
    paddingRight: "24px",
  }}
>
  {formatPrice(
    product.sale_price
  )}
</td>


                      {/* NOTE */}

                      <td
  style={{
    minWidth: "180px",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    paddingLeft: "24px",
    paddingRight: "16px",
  }}
>
  {product.note || "-"}
</td>


                      {/* GHI CHÚ */}

                      <td
                        style={{
                          minWidth:
                            "180px",

                          whiteSpace:
                            "normal",

                          overflowWrap:
                            "anywhere",
                        }}
                      >
                        {product.description ||
                          "-"}
                      </td>


                      {/* THAO TÁC */}

                      <td
                        style={{
                          whiteSpace:
                            "nowrap",
                        }}
                      >
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


      {/* =================================================
          PAGINATION
      ================================================== */}

      <div>
        <label htmlFor="page-size">
          Số dòng/trang:{" "}
        </label>

        <select
          id="page-size"
          value={
            pageSize
          }
          onChange={
            handlePageSizeChange
          }
          disabled={
            loading
          }
        >
          <option value={30}>
            30
          </option>

          <option value={50}>
            50
          </option>

          <option value={100}>
            100
          </option>

          <option value={200}>
            200
          </option>
        </select>


        {" "}


        <button
          type="button"
          onClick={() =>
            setPage(
              (
                current
              ) =>
                Math.max(
                  1,
                  current -
                    1
                )
            )
          }
          disabled={
            loading ||
            page <= 1 ||
            totalPages ===
              0
          }
        >
          Trang trước
        </button>


        <span>
          {" "}

          Trang{" "}

          <strong>
            {page}
          </strong>

          {" / "}

          <strong>
            {totalPages}
          </strong>

          {" "}
        </span>


        <button
          type="button"
          onClick={() =>
            setPage(
              (
                current
              ) =>
                Math.min(
                  totalPages,
                  current +
                    1
                )
            )
          }
          disabled={
            loading ||
            totalPages ===
              0 ||
            page >=
              totalPages
          }
        >
          Trang sau
        </button>
      </div>
    </section>
  );
}