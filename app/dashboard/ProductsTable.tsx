"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import * as XLSX from "xlsx";
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

type ImportPreviewRow = {
  productCode: string;
  inputProductName: string;
  targetUsername: string;
  manufactureDate: string;
  expiryDate: string;
  quantity: string;
  reminderDate: string;
  note: string;
  description: string;
};

type BulkImportResponse = {
  success: boolean;
  message?: string;
  successCount?: number;
  failedCount?: number;
  errors?: Array<{
    row: number;
    productCode?: string;
    message: string;
  }>;
  error?: string;
};

const EMPTY_STATS: DashboardStats = {
  totalProducts: 0,
  warningProducts: 0,
  reminderProducts: 0,
  addedTodayProducts: 0,
};

const STATUS_OPTIONS: Array<{
  value: "" | ProductStatus;
  label: string;
}> = [
  { value: "", label: "Tất cả" },
  { value: "BINH_THUONG", label: "Bình thường" },
  { value: "CANH_BAO", label: "Cảnh báo" },
  { value: "BAO_LAI", label: "Báo lại" },
  { value: "DA_BAO", label: "Đã báo" },
  { value: "LOI", label: "Lỗi" },
];

const SORT_OPTIONS: Array<{
  value: SortOption;
  label: string;
}> = [
  { value: "NEWEST", label: "Mới nhất" },
  { value: "TEN_ASC", label: "Tên A → Z" },
  { value: "TEN_DESC", label: "Tên Z → A" },
  { value: "PERCENT_ASC", label: "% HSD tăng dần" },
  { value: "PERCENT_DESC", label: "% HSD giảm dần" },
  { value: "HSD_ASC", label: "HSD gần nhất" },
  { value: "HSD_DESC", label: "HSD xa nhất" },
];

const PAGE_SIZE_OPTIONS = [30, 50, 100, 200];
const PRODUCTS_CHANGED_EVENT = "hsd:products-changed";

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parts = value.split("-");
  if (parts.length !== 3) {
    return value;
  }

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function formatMoney(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("vi-VN").format(value);
}

function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}

function formatStatusLabel(status: ProductStatus): string {
  switch (status) {
    case "BINH_THUONG":
      return "Bình thường";
    case "CANH_BAO":
      return "Cảnh báo";
    case "BAO_LAI":
      return "Báo lại";
    case "DA_BAO":
      return "Đã báo";
    case "LOI":
      return "Lỗi";
    default:
      return status;
  }
}

function getStatusBadgeClass(status: ProductStatus): string {
  switch (status) {
    case "BINH_THUONG":
      return "bg-emerald-100 text-emerald-700";
    case "CANH_BAO":
      return "bg-amber-100 text-amber-800";
    case "BAO_LAI":
      return "bg-violet-100 text-violet-700";
    case "DA_BAO":
      return "bg-sky-100 text-sky-700";
    case "LOI":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function buildQueryString(params: {
  page: number;
  pageSize: number;
  search: string;
  userId: string;
  status: string;
  sort: SortOption;
  exportAll?: boolean;
}): string {
  const query = new URLSearchParams();

  query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize));
  query.set("sort", params.sort);

  if (params.search.trim()) {
    query.set("search", params.search.trim());
  }

  if (params.userId) {
    query.set("userId", params.userId);
  }

  if (params.status) {
    query.set("status", params.status);
  }

  if (params.exportAll) {
    query.set("export", "1");
  }

  return query.toString();
}

function excelSerialToIso(value: number): string {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const jsDate = new Date(excelEpoch.getTime() + value * 86400000);

  const year = jsDate.getUTCFullYear();
  const month = String(jsDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jsDate.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeLooseDateToIso(rawValue: unknown): string | null {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return excelSerialToIso(rawValue);
  }

  const value = String(rawValue).trim();
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return value;
    }

    return null;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);

    if (slashMatch[3].length === 2) {
      year += 2000;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
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

  const compactMatch = value.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
  if (compactMatch) {
    const day = Number(compactMatch[1]);
    const month = Number(compactMatch[2]);
    let year = Number(compactMatch[3]);

    if (compactMatch[3].length === 2) {
      year += 2000;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
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

  return null;
}

function getCellValue(
  row: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (key in row) {
      return row[key];
    }
  }

  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    key.trim().toLocaleLowerCase("vi"),
    value,
  ] as const);

  for (const key of keys) {
    const normalizedKey = key.trim().toLocaleLowerCase("vi");
    const found = normalizedEntries.find(([entryKey]) => entryKey === normalizedKey);
    if (found) {
      return found[1];
    }
  }

  return "";
}

function downloadExcel(
  rows: Array<Record<string, string | number>>,
  fileName: string
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();

  const columnWidths = Object.keys(rows[0] ?? {}).map((key) => {
    let maxLength = key.length;

    for (const row of rows) {
      const cellValue = String(row[key] ?? "");
      maxLength = Math.max(maxLength, cellValue.length);
    }

    return { wch: Math.min(Math.max(maxLength + 2, 12), 55) };
  });

  worksheet["!cols"] = columnWidths;
  XLSX.utils.book_append_sheet(workbook, worksheet, "Products");
  XLSX.writeFile(workbook, fileName);
}

function buildExcelRows(products: Product[]) {
  return products.map((product, index) => ({
    STT: index + 1,
    "Mã sản phẩm": product.product_code,
    "Tên sản phẩm": product.product_name,
    NSX: formatDate(product.manufacture_date),
    HSD: formatDate(product.expiry_date),
    "Ngày báo lại": formatDate(product.reminder_date),
    "Số lượng": product.quantity,
    "Giá bán": product.sale_price ?? "",
    "% còn lại": product.percent_remaining ?? "",
    "Trạng thái": formatStatusLabel(product.status),
    Note: product.note ?? "",
    "Ghi chú": product.description ?? "",
  }));
}

function InfoItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold leading-4 text-slate-500">
        {label}
      </div>
      <div className="mt-0.5 break-words text-[13px] font-semibold leading-5 text-slate-900">
        {children}
      </div>
    </div>
  );
}

export default function ProductsTable() {
  const [products, setProducts] = useState<Product[]>([]);
  const [filterUsers, setFilterUsers] = useState<FilterUser[]>([]);
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [sort, setSort] = useState<SortOption>("NEWEST");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const hasLoadedOnceRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showImportModal, setShowImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportPreviewRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [importResultErrors, setImportResultErrors] = useState<
    BulkImportResponse["errors"]
  >([]);

  const allCurrentPageSelected =
    products.length > 0 &&
    products.every((product) => selectedIds.has(product.id));

  const selectedCount = selectedIds.size;

  const hasActiveFilterOrSort =
    Boolean(search.trim()) ||
    Boolean(selectedUserId) ||
    Boolean(selectedStatus) ||
    sort !== "NEWEST";

  const queryString = useMemo(() => {
    return buildQueryString({
      page,
      pageSize,
      search,
      userId: selectedUserId,
      status: selectedStatus,
      sort,
    });
  }, [page, pageSize, search, selectedUserId, selectedStatus, sort]);

  const loadProducts = useCallback(async () => {
    requestControllerRef.current?.abort();

    const controller = new AbortController();
    requestControllerRef.current = controller;

    const firstLoad = !hasLoadedOnceRef.current;

    if (firstLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      setError("");

      const response = await fetch(`/api/products?${queryString}`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });

      const data = (await response.json()) as ProductsResponse | { error?: string };

      if (!response.ok || !("success" in data) || !data.success) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Không thể tải danh sách sản phẩm."
        );
      }

      if (controller.signal.aborted) {
        return;
      }

      setProducts(data.products);
      setFilterUsers(data.filterUsers);
      setStats(data.stats);
      setTotal(data.pagination.total);
      setTotalPages(Math.max(data.pagination.totalPages || 1, 1));
      hasLoadedOnceRef.current = true;

      if (data.pagination.page !== page) {
        setPage(data.pagination.page);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      if (!hasLoadedOnceRef.current) {
        setProducts([]);
        setFilterUsers([]);
        setStats(EMPTY_STATS);
        setTotal(0);
        setTotalPages(1);
      }

      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách sản phẩm."
      );
    } finally {
      if (requestControllerRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [queryString, page]);

  useEffect(() => {
    void loadProducts();

    return () => {
      requestControllerRef.current?.abort();
    };
  }, [loadProducts]);

  useEffect(() => {
    const handleProductsChanged = () => {
      if (page !== 1 && sort === "NEWEST") {
        setPage(1);
        return;
      }

      void loadProducts();
    };

    window.addEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);

    return () => {
      window.removeEventListener(PRODUCTS_CHANGED_EVENT, handleProductsChanged);
    };
  }, [loadProducts, page, sort]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, pageSize, search, selectedUserId, selectedStatus, sort]);

  function handleUserChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedUserId(event.target.value);
    setPage(1);
  }

  function handleStatusChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedStatus(event.target.value);
    setPage(1);
  }

  function handleSortChange(event: ChangeEvent<HTMLSelectElement>) {
    setSort(event.target.value as SortOption);
    setPage(1);
  }

  function handlePageSizeChange(event: ChangeEvent<HTMLSelectElement>) {
    setPageSize(Number(event.target.value));
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setSelectedUserId("");
    setSelectedStatus("");
    setSort("NEWEST");
    setPage(1);
  }

  function toggleSelectOne(productId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }

      return next;
    });
  }

  function toggleSelectAllCurrentPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (allCurrentPageSelected) {
        for (const product of products) {
          next.delete(product.id);
        }
      } else {
        for (const product of products) {
          next.add(product.id);
        }
      }

      return next;
    });
  }

  async function exportFilteredExcel() {
    try {
      setExporting(true);

      const exportQuery = buildQueryString({
        page: 1,
        pageSize: 200,
        search,
        userId: selectedUserId,
        status: selectedStatus,
        sort,
        exportAll: true,
      });

      const firstResponse = await fetch(`/api/products?${exportQuery}`, {
        method: "GET",
        cache: "no-store",
      });

      const firstData = (await firstResponse.json()) as
        | ProductsResponse
        | { error?: string };

      if (
        !firstResponse.ok ||
        !("success" in firstData) ||
        !firstData.success
      ) {
        throw new Error(
          "error" in firstData && firstData.error
            ? firstData.error
            : "Không thể xuất Excel."
        );
      }

      /*
       * API mới hỗ trợ ?export=1 nên thông thường chỉ cần 1 request.
       *
       * Fallback phía dưới cố ý được giữ lại:
       * nếu server đang chạy bản route cũ và chỉ trả 1 trang,
       * frontend sẽ tự tải toàn bộ các trang 200 dòng rồi ghép lại.
       *
       * Vì vậy xuất mặc định không còn phụ thuộc vào việc API export
       * đã được deploy hay chưa.
       */
      let exportProducts = firstData.products;

      if (exportProducts.length < firstData.pagination.total) {
        const exportPageSize = 200;
        const exportTotalPages = Math.ceil(
          firstData.pagination.total / exportPageSize
        );

        const firstNormalPageQuery = buildQueryString({
          page: 1,
          pageSize: exportPageSize,
          search,
          userId: selectedUserId,
          status: selectedStatus,
          sort,
        });

        const firstNormalPageResponse = await fetch(
          `/api/products?${firstNormalPageQuery}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const firstNormalPageData = (await firstNormalPageResponse.json()) as
          | ProductsResponse
          | { error?: string };

        if (
          !firstNormalPageResponse.ok ||
          !("success" in firstNormalPageData) ||
          !firstNormalPageData.success
        ) {
          throw new Error(
            "error" in firstNormalPageData && firstNormalPageData.error
              ? firstNormalPageData.error
              : "Không thể tải toàn bộ dữ liệu để xuất Excel."
          );
        }

        const remainingPages = Array.from(
          { length: Math.max(exportTotalPages - 1, 0) },
          (_, index) => index + 2
        );

        const remainingResults = await Promise.all(
          remainingPages.map(async (exportPage) => {
            const pageQuery = buildQueryString({
              page: exportPage,
              pageSize: exportPageSize,
              search,
              userId: selectedUserId,
              status: selectedStatus,
              sort,
            });

            const response = await fetch(`/api/products?${pageQuery}`, {
              method: "GET",
              cache: "no-store",
            });

            const data = (await response.json()) as
              | ProductsResponse
              | { error?: string };

            if (!response.ok || !("success" in data) || !data.success) {
              throw new Error(
                "error" in data && data.error
                  ? data.error
                  : `Không thể tải trang ${exportPage} để xuất Excel.`
              );
            }

            return data.products;
          })
        );

        exportProducts = [
          ...firstNormalPageData.products,
          ...remainingResults.flat(),
        ];
      }

      if (!exportProducts.length) {
        throw new Error("Không có dữ liệu để xuất Excel.");
      }

      /*
       * Loại trùng theo id để bảo vệ trường hợp dữ liệu thay đổi
       * trong lúc các trang đang được tải.
       */
      const uniqueProducts = Array.from(
        new Map(
          exportProducts.map((product) => [product.id, product])
        ).values()
      );

      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[:T]/g, "-");

      const prefix = hasActiveFilterOrSort
        ? "san-pham-theo-bo-loc"
        : "toan-bo-san-pham";

      downloadExcel(
        buildExcelRows(uniqueProducts),
        `${prefix}-${timestamp}.xlsx`
      );
    } catch (err) {
      window.alert(
        err instanceof Error
          ? err.message
          : "Không thể xuất Excel."
      );
    } finally {
      setExporting(false);
    }
  }

  function exportSelectedExcel() {
    const selectedProducts = products.filter((product) =>
      selectedIds.has(product.id)
    );

    if (!selectedProducts.length) {
      window.alert("Bạn chưa chọn sản phẩm nào ở trang hiện tại.");
      return;
    }

    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, "-");

    downloadExcel(
      buildExcelRows(selectedProducts),
      `san-pham-da-chon-${timestamp}.xlsx`
    );
  }

  function downloadImportTemplate() {
    const rows = [
      {
        User: "",
        "Mã sản phẩm": "8934591001233",
        "Tên sản phẩm": "Rượu nếp mới Hà Nội 30% 500ml",
        NSX: "01/10/2026",
        HSD: "01/10/2027",
        "Số lượng": 1,
        "Ngày báo lại": "",
        Note: "",
        "Ghi chú": "",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 20 },
      { wch: 42 },
      { wch: 15 },
      { wch: 15 },
      { wch: 12 },
      { wch: 18 },
      { wch: 24 },
      { wch: 32 },
    ];

    const guideRows = [
      {
        "Cột": "Mã sản phẩm",
        "Hướng dẫn": "Bắt buộc. Hệ thống dùng mã này để tìm sản phẩm trong DATA.",
      },
      {
        "Cột": "Tên sản phẩm",
        "Hướng dẫn":
          "Chỉ để người nhập dễ phân biệt. Khi import, hệ thống bỏ qua tên này và tự lấy tên chuẩn từ DATA theo Mã sản phẩm.",
      },
      {
        "Cột": "User",
        "Hướng dẫn":
          "Có thể để trống để nhập cho tài khoản đang đăng nhập. ADMIN/MANAGER vẫn bị giới hạn theo quyền hiện có.",
      },
      {
        "Cột": "NSX / HSD / Ngày báo lại",
        "Hướng dẫn": "Nên nhập theo DD/MM/YYYY.",
      },
    ];

    const guideSheet = XLSX.utils.json_to_sheet(guideRows);
    guideSheet["!cols"] = [{ wch: 26 }, { wch: 90 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Import");
    XLSX.utils.book_append_sheet(workbook, guideSheet, "Huong dan");
    XLSX.writeFile(workbook, "mau-nhap-hang-loat.xlsx");
  }

  function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    setImportError("");
    setImportSuccess("");
    setImportResultErrors([]);
    setImportRows([]);
    setImportFileName("");

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = (loadEvent) => {
      try {
        const arrayBuffer = loadEvent.target?.result;

        if (!(arrayBuffer instanceof ArrayBuffer)) {
          throw new Error("Không thể đọc file.");
        }

        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];

        if (!firstSheetName) {
          throw new Error("File Excel không có sheet.");
        }

        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          worksheet,
          { defval: "" }
        );

        if (jsonRows.length > 1000) {
          throw new Error("Mỗi lần chỉ nhập tối đa 1.000 dòng.");
        }

        const normalizedRows = jsonRows
          .map((row) => {
            const productCode = String(
              getCellValue(row, [
                "Mã sản phẩm",
                "Mã SP",
                "MA_SP",
                "productCode",
                "Product Code",
              ]) ?? ""
            ).trim();

            const inputProductName = String(
              getCellValue(row, [
                "Tên sản phẩm",
                "Tên SP",
                "TEN_SP",
                "productName",
                "Product Name",
              ]) ?? ""
            ).trim();

            const targetUsername = String(
              getCellValue(row, [
                "User",
                "USER",
                "Username",
                "Người dùng",
                "targetUsername",
              ]) ?? ""
            ).trim();

            const manufactureDate = normalizeLooseDateToIso(
              getCellValue(row, ["NSX", "Ngày sản xuất", "manufactureDate"])
            );

            const expiryDate = normalizeLooseDateToIso(
              getCellValue(row, ["HSD", "Hạn sử dụng", "expiryDate"])
            );

            const reminderDate = normalizeLooseDateToIso(
              getCellValue(row, ["Ngày báo lại", "reminderDate"])
            );

            const quantityRaw = getCellValue(row, ["Số lượng", "quantity"]);

            const note = String(
              getCellValue(row, ["Note", "note"]) ?? ""
            ).trim();

            const description = String(
              getCellValue(row, ["Ghi chú", "description"]) ?? ""
            ).trim();

            return {
              productCode,
              inputProductName,
              targetUsername,
              manufactureDate: manufactureDate ?? "",
              expiryDate: expiryDate ?? "",
              quantity: String(quantityRaw ?? "").trim() || "1",
              reminderDate: reminderDate ?? "",
              note,
              description,
            };
          })
          .filter((row) => row.productCode);

        if (!normalizedRows.length) {
          throw new Error("Không tìm thấy dòng nào có Mã sản phẩm.");
        }

        setImportRows(normalizedRows);
        setImportFileName(file.name);
      } catch (err) {
        setImportError(
          err instanceof Error ? err.message : "Không thể đọc file Excel."
        );
      }
    };

    reader.onerror = () => {
      setImportError("Không thể đọc file Excel.");
    };

    reader.readAsArrayBuffer(file);
  }

  async function handleBulkImport() {
    if (!importRows.length) {
      setImportError("Chưa có dữ liệu để nhập.");
      return;
    }

    try {
      setImportLoading(true);
      setImportError("");
      setImportSuccess("");
      setImportResultErrors([]);

      const response = await fetch("/api/products/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          products: importRows.map((row) => ({
            productCode: row.productCode,
            targetUsername: row.targetUsername || null,
            manufactureDate: row.manufactureDate,
            expiryDate: row.expiryDate,
            quantity: Number(row.quantity || "1"),
            reminderDate: row.reminderDate || null,
            note: row.note || null,
            description: row.description || null,
          })),
        }),
      });

      const data = (await response.json()) as BulkImportResponse;

      if (!response.ok && !data.successCount) {
        throw new Error(data.error || data.message || "Không thể nhập hàng loạt.");
      }

      setImportResultErrors(data.errors ?? []);
      setImportSuccess(
        data.message ||
          `Nhập xong. Thành công: ${data.successCount ?? 0}, lỗi: ${data.failedCount ?? 0}.`
      );

      await loadProducts();
    } catch (err) {
      setImportError(
        err instanceof Error ? err.message : "Không thể nhập hàng loạt."
      );
    } finally {
      setImportLoading(false);
    }
  }

  function closeImportModal() {
    if (importLoading) {
      return;
    }

    setShowImportModal(false);
    setImportRows([]);
    setImportFileName("");
    setImportError("");
    setImportSuccess("");
    setImportResultErrors([]);
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 lg:p-5">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <h2 className="m-0 text-xl font-extrabold text-slate-900 sm:text-2xl">
              Danh sách sản phẩm
            </h2>
            <p className="mt-1 text-xs text-slate-500 sm:text-sm">
              Hiển thị {products.length} sản phẩm ở trang {page}/{totalPages}
              <span className="mx-1.5 text-slate-300">•</span>
              Tổng theo bộ lọc: {total}
              {refreshing && (
                <>
                  <span className="mx-1.5 text-slate-300">•</span>
                  <span className="font-semibold text-sky-600">Đang cập nhật...</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              Nhập hàng loạt
            </button>

            <button
              type="button"
              onClick={exportFilteredExcel}
              disabled={exporting}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              {exporting
                ? "Đang xuất..."
                : hasActiveFilterOrSort
                  ? "Xuất theo bộ lọc"
                  : "Xuất toàn bộ"}
            </button>

            <button
              type="button"
              onClick={exportSelectedExcel}
              disabled={selectedCount === 0}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              Xuất đã chọn ({selectedCount})
            </button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
          <div className="rounded-xl bg-gradient-to-br from-red-600 to-red-700 p-3 text-white shadow-sm sm:p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-white/80">
              Tổng sản phẩm
            </div>
            <div className="mt-1 text-2xl font-black leading-none sm:text-3xl">
              {stats.totalProducts}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-sm sm:p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Cảnh báo
            </div>
            <div className="mt-1 text-2xl font-black leading-none text-amber-700 sm:text-3xl">
              {stats.warningProducts}
            </div>
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 shadow-sm sm:p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-violet-700">
              Báo lại
            </div>
            <div className="mt-1 text-2xl font-black leading-none text-violet-700 sm:text-3xl">
              {stats.reminderProducts}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm sm:p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
              Đã thêm hôm nay
            </div>
            <div className="mt-1 text-2xl font-black leading-none text-emerald-700 sm:text-3xl">
              {stats.addedTodayProducts}
            </div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(280px,1.8fr)_minmax(170px,.85fr)_minmax(160px,.8fr)_minmax(170px,.85fr)_150px_auto]">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              Tìm kiếm
            </label>
            <input
              type="text"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Mã SP, tên SP, note hoặc ghi chú..."
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              Người dùng
            </label>
            <select
              value={selectedUserId}
              onChange={handleUserChange}
              className="w-full"
            >
              <option value="">Tất cả</option>
              {filterUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.display_name || user.username}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              Trạng thái
            </label>
            <select
              value={selectedStatus}
              onChange={handleStatusChange}
              className="w-full"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value || "ALL"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              Sắp xếp
            </label>
            <select value={sort} onChange={handleSortChange} className="w-full">
              {SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">
              Dòng / trang
            </label>
            <select
              value={pageSize}
              onChange={handlePageSizeChange}
              className="w-full"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilterOrSort}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 xl:w-auto"
            >
              Xóa lọc
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 sm:text-sm">
            <input
              type="checkbox"
              checked={allCurrentPageSelected}
              onChange={toggleSelectAllCurrentPage}
            />
            Chọn tất cả trang hiện tại
          </label>

          <span className="text-xs text-slate-500 sm:text-sm">
            Đã chọn: <strong>{selectedCount}</strong>
          </span>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-50"
              />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center">
            <div className="font-bold text-slate-700">Không có sản phẩm phù hợp</div>
            <div className="mt-1 text-sm text-slate-500">
              Thử thay đổi từ khóa hoặc bộ lọc.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <article
                key={product.id}
                className="grid grid-cols-[34px_minmax(0,1fr)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md xl:grid-cols-[34px_minmax(330px,1.65fr)_minmax(290px,1.25fr)_minmax(255px,1.05fr)_minmax(220px,.95fr)_150px]"
              >
                <div className="flex items-start justify-center border-r border-slate-200 px-2 py-3 xl:items-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => toggleSelectOne(product.id)}
                    aria-label={`Chọn ${product.product_code}`}
                  />
                </div>

                <div className="min-w-0 px-3 py-2.5 xl:border-r xl:border-slate-200">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Mã SP
                    </span>
                    <strong className="text-sm text-slate-900">
                      {product.product_code}
                    </strong>
                  </div>

                  <div className="mt-1 text-[13px] font-bold leading-5 text-slate-900 sm:text-sm">
                    {product.product_name || "-"}
                  </div>

                  <div className="mt-1 text-[11px] leading-4 text-slate-500">
                    User: {product.owner?.display_name || product.owner?.username || "-"}
                    {product.owner?.display_name && product.owner?.username
                      ? ` (${product.owner.username})`
                      : ""}
                  </div>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200 px-3 py-2.5 xl:col-span-1 xl:border-l-0 xl:border-r xl:border-t-0">
                  <InfoItem label="Ngày sản xuất">
                    {formatDate(product.manufacture_date)}
                  </InfoItem>
                  <InfoItem label="Hạn sử dụng">
                    {formatDate(product.expiry_date)}
                  </InfoItem>
                  <InfoItem label="Số lượng">{product.quantity}</InfoItem>
                  <InfoItem label="Giá bán">
                    {formatMoney(product.sale_price)}
                  </InfoItem>
                </div>

                <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200 px-3 py-2.5 xl:col-span-1 xl:border-r xl:border-t-0">
                  <InfoItem label="Ngày báo lại">
                    {formatDate(product.reminder_date)}
                  </InfoItem>
                  <InfoItem label="% còn lại">
                    {formatPercent(product.percent_remaining)}
                  </InfoItem>
                  <InfoItem label="Ngưỡng">
                    {product.threshold_percent}%
                  </InfoItem>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold leading-4 text-slate-500">
                      Trạng thái
                    </div>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${getStatusBadgeClass(
                        product.status
                      )}`}
                    >
                      {formatStatusLabel(product.status)}
                    </span>
                  </div>
                </div>

                <div className="col-span-2 grid grid-cols-1 gap-2 border-t border-slate-200 px-3 py-2.5 sm:grid-cols-2 xl:col-span-1 xl:grid-cols-1 xl:border-r xl:border-t-0">
                  <InfoItem label="Note">{product.note || "-"}</InfoItem>
                  <InfoItem label="Ghi chú">
                    {product.description || "-"}
                  </InfoItem>
                </div>

                <div className="col-span-2 flex items-center justify-end border-t border-slate-200 px-3 py-2.5 xl:col-span-1 xl:justify-center xl:border-t-0">
                  <ProductActions product={product} onChanged={loadProducts} />
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500 sm:text-sm">
            Trang <strong>{page}</strong> / <strong>{totalPages}</strong>
          </div>

          <div className="grid grid-cols-4 gap-1.5 sm:flex">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              Đầu
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              Trước
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              Sau
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold disabled:opacity-40"
            >
              Cuối
            </button>
          </div>
        </div>
      </section>

      {showImportModal && (
        <div className="kk-modal-backdrop">
          <div className="kk-modal" style={{ width: "min(1100px, 100%)" }}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="m-0 text-xl font-extrabold text-slate-900">
                  Nhập hàng loạt
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Hỗ trợ XLSX, XLS và CSV. User để trống sẽ nhập cho tài khoản đang đăng nhập.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadImportTemplate}
                  disabled={importLoading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  Tải file mẫu
                </button>
                <button
                  type="button"
                  onClick={closeImportModal}
                  disabled={importLoading}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                >
                  Đóng
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportFileChange}
                disabled={importLoading}
                className="w-full"
              />

              {importFileName && (
                <div className="mt-2 text-xs text-slate-600">
                  File: <strong>{importFileName}</strong>
                  <span className="mx-1.5 text-slate-300">•</span>
                  {importRows.length} dòng
                </div>
              )}
            </div>

            {importError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {importError}
              </div>
            )}

            {importSuccess && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                {importSuccess}
              </div>
            )}

            {importResultErrors && importResultErrors.length > 0 && (
              <div className="mt-3 max-h-36 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="mb-1 font-extrabold">Các dòng bị lỗi</div>
                {importResultErrors.slice(0, 50).map((item, index) => (
                  <div key={`${item.row}-${index}`}>
                    Dòng {item.row}: {item.productCode ? `${item.productCode} - ` : ""}
                    {item.message}
                  </div>
                ))}
                {importResultErrors.length > 50 && (
                  <div className="mt-1 font-bold">
                    ... còn {importResultErrors.length - 50} lỗi khác.
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500">
                Cột hỗ trợ: User, Mã sản phẩm, Tên sản phẩm, NSX, HSD, Số lượng, Ngày báo lại, Note, Ghi chú.
                Tên sản phẩm chỉ để tham khảo, hệ thống luôn lấy tên chuẩn từ DATA theo Mã sản phẩm.
              </div>

              <button
                type="button"
                onClick={handleBulkImport}
                disabled={importLoading || importRows.length === 0}
                className="kk-button-primary min-w-36"
              >
                {importLoading ? "Đang nhập..." : `Nhập ${importRows.length} dòng`}
              </button>
            </div>

            {importRows.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-[1180px] border-0 text-left text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2">Mã SP</th>
                      <th className="px-3 py-2">Tên sản phẩm (tham khảo)</th>
                      <th className="px-3 py-2">NSX</th>
                      <th className="px-3 py-2">HSD</th>
                      <th className="px-3 py-2">SL</th>
                      <th className="px-3 py-2">Ngày báo lại</th>
                      <th className="px-3 py-2">Note</th>
                      <th className="px-3 py-2">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 25).map((row, index) => (
                      <tr key={`${row.productCode}-${index}`}>
                        <td className="px-3 py-2">{index + 2}</td>
                        <td className="px-3 py-2">{row.targetUsername || "-"}</td>
                        <td className="px-3 py-2 font-bold">{row.productCode}</td>
                        <td className="max-w-[320px] truncate px-3 py-2" title={row.inputProductName}>
                          {row.inputProductName || "-"}
                        </td>
                        <td className="px-3 py-2">{formatDate(row.manufactureDate || null)}</td>
                        <td className="px-3 py-2">{formatDate(row.expiryDate || null)}</td>
                        <td className="px-3 py-2">{row.quantity}</td>
                        <td className="px-3 py-2">{formatDate(row.reminderDate || null)}</td>
                        <td className="px-3 py-2">{row.note || "-"}</td>
                        <td className="px-3 py-2">{row.description || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {importRows.length > 25 && (
              <div className="mt-2 text-xs text-slate-400">
                Chỉ xem trước 25 dòng đầu. File thực tế có {importRows.length} dòng.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
