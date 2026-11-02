"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type ParsedCatalogRow = {
  rowNumber: number;
  productCode: string;
  productName: string;
  salePrice: number | null;
};

type ImportResult = {
  totalRows?: number;
  existingBefore?: number;
  catalogUpdated?: number;
  catalogInserted?: number;
  catalogDeleted?: number;
  productsSynced?: number;
  staleProductsCleared?: number;
  finalCatalogCount?: number;
};

type Props = {
  initialCatalogCount: number;
};

const MAX_ROWS = 300000;
const CHUNK_SIZE = 2500;
const CONCURRENCY = 4;

const CODE_HEADERS = new Set([
  "productcode",
  "masanpham",
  "masp",
  "makiot",
  "barcode",
  "code",
]);

const NAME_HEADERS = new Set([
  "productname",
  "tensanpham",
  "tensp",
  "ten",
  "name",
]);

const PRICE_HEADERS = new Set([
  "saleprice",
  "giaban",
  "gia",
  "price",
]);

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findColumn(keys: string[], aliases: Set<string>): string | null {
  for (const key of keys) {
    if (aliases.has(normalizeHeader(key))) {
      return key;
    }
  }

  return null;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parsePrice(value: unknown): number | null | "INVALID" {
  if (value === null || value === undefined || textValue(value) === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : "INVALID";
  }

  let raw = textValue(value).replace(/[₫đvnd\s]/gi, "");

  if (!raw) {
    return null;
  }

  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
    raw = raw.replace(/[.,]/g, "");
  } else if (/^\d+[,.]\d{1,2}$/.test(raw)) {
    raw = raw.replace(",", ".");
  } else {
    raw = raw.replace(/,/g, "");
  }

  const numberValue = Number(raw);

  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return "INVALID";
  }

  return numberValue;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export default function CatalogImportClient({ initialCatalogCount }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [catalogCount, setCatalogCount] = useState(initialCatalogCount);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedCatalogRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedRows, setUploadedRows] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const progress =
    rows.length > 0
      ? Math.min(100, Math.round((uploadedRows / rows.length) * 100))
      : 0;

  function resetSelection() {
    setRows([]);
    setErrors([]);
    setFileName("");
    setMessage("");
    setResult(null);
    setUploadedRows(0);
    setConfirming(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function handleFile(file: File) {
    setReading(true);
    setMessage("");
    setResult(null);
    setErrors([]);
    setRows([]);
    setUploadedRows(0);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, {
        type: "array",
        cellText: true,
        cellDates: false,
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error("File không có sheet dữ liệu.");
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        {
          defval: "",
          raw: false,
        }
      );

      if (rawRows.length === 0) {
        throw new Error("File không có dữ liệu.");
      }

      if (rawRows.length > MAX_ROWS) {
        throw new Error(`File vượt quá ${formatNumber(MAX_ROWS)} dòng.`);
      }

      const keys = Object.keys(rawRows[0]);
      const codeColumn = findColumn(keys, CODE_HEADERS);
      const nameColumn = findColumn(keys, NAME_HEADERS);
      const priceColumn = findColumn(keys, PRICE_HEADERS);

      if (!codeColumn || !nameColumn || !priceColumn) {
        throw new Error(
          "Không nhận diện được đủ 3 cột Mã SP, Tên SP và Giá bán. Hỗ trợ makiot/ten/giaban hoặc product_code/product_name/sale_price."
        );
      }

      const parsed: ParsedCatalogRow[] = [];
      const validationErrors: string[] = [];
      const codeSet = new Set<string>();

      rawRows.forEach((row, index) => {
        const sourceRow = index + 2;
        const productCode = textValue(row[codeColumn]);
        const productName = textValue(row[nameColumn]);
        const rawPrice = row[priceColumn];

        if (!productCode && !productName && textValue(rawPrice) === "") {
          return;
        }

        if (!productCode) {
          if (validationErrors.length < 30) {
            validationErrors.push(`Dòng ${sourceRow}: thiếu mã sản phẩm.`);
          }
          return;
        }

        if (!productName) {
          if (validationErrors.length < 30) {
            validationErrors.push(`Dòng ${sourceRow}: thiếu tên sản phẩm.`);
          }
          return;
        }

        const salePrice = parsePrice(rawPrice);

        if (salePrice === "INVALID") {
          if (validationErrors.length < 30) {
            validationErrors.push(`Dòng ${sourceRow}: giá bán không hợp lệ.`);
          }
          return;
        }

        const duplicateKey = productCode.toLowerCase();

        if (codeSet.has(duplicateKey)) {
          if (validationErrors.length < 30) {
            validationErrors.push(
              `Dòng ${sourceRow}: mã '${productCode}' bị trùng.`
            );
          }
          return;
        }

        codeSet.add(duplicateKey);

        parsed.push({
          rowNumber: sourceRow,
          productCode,
          productName,
          salePrice,
        });
      });

      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        throw new Error(
          "File có dữ liệu lỗi. DATA hiện tại chưa bị thay đổi."
        );
      }

      if (parsed.length === 0) {
        throw new Error("Không có dòng hợp lệ để cập nhật.");
      }

      setRows(parsed);
      setMessage(
        `Đã kiểm tra ${formatNumber(
          parsed.length
        )} dòng. Chưa có dữ liệu nào được thay đổi trên hệ thống.`
      );
    } catch (error) {
      setRows([]);
      setMessage(
        error instanceof Error ? error.message : "Không thể đọc file DATA."
      );
    } finally {
      setReading(false);
    }
  }

  async function postImport(payload: unknown) {
    const response = await fetch("/api/catalog/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Không thể cập nhật DATA.");
    }

    return data;
  }

  async function cancelImport(importId: string) {
    try {
      await postImport({
        action: "cancel",
        importId,
      });
    } catch {
      // Không che lỗi chính bằng lỗi cleanup.
    }
  }

  async function performImport() {
    if (rows.length === 0 || uploading) {
      return;
    }

    setConfirming(false);
    setUploading(true);
    setUploadedRows(0);
    setMessage("Đang tạo phiên cập nhật DATA...");
    setResult(null);

    let importId = "";

    try {
      const start = await postImport({
        action: "start",
        fileName,
        totalRows: rows.length,
      });

      importId = start.importId;

      const chunks: ParsedCatalogRow[][] = [];

      for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
        chunks.push(rows.slice(index, index + CHUNK_SIZE));
      }

      let nextChunk = 0;

      async function worker() {
        while (true) {
          const chunkIndex = nextChunk;
          nextChunk += 1;

          if (chunkIndex >= chunks.length) {
            return;
          }

          const chunk = chunks[chunkIndex];

          await postImport({
            action: "chunk",
            importId,
            rows: chunk,
          });

          setUploadedRows((current) => current + chunk.length);
        }
      }

      const workerCount = Math.min(CONCURRENCY, chunks.length);

      await Promise.all(
        Array.from({ length: workerCount }, () => worker())
      );

      setMessage(
        "Upload hoàn tất. Đang thay DATA cũ và đồng bộ giá/tên sản phẩm..."
      );

      const committed = await postImport({
        action: "commit",
        importId,
      });

      const importResult = (committed.result ?? {}) as ImportResult;
      setResult(importResult);

      const finalCount = Number(
        importResult.finalCatalogCount ?? rows.length
      );

      setCatalogCount(finalCount);
      setUploadedRows(rows.length);
      setMessage(
        committed.message || "Cập nhật DATA thành công."
      );
    } catch (error) {
      if (importId) {
        await cancelImport(importId);
      }

      setMessage(
        error instanceof Error ? error.message : "Không thể cập nhật DATA."
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <section className="catalog-card">
        <div className="catalog-card-header">
          <div>
            <h2>Upload DATA mới</h2>
            <p>
              Chỉ ADMIN. File mới sẽ thay toàn bộ DATA cũ sau khi kiểm tra và
              upload hoàn tất.
            </p>
          </div>

          <div className="catalog-count">
            <span>DATA hiện tại</span>
            <strong>{formatNumber(catalogCount)}</strong>
          </div>
        </div>

        <div className="upload-box">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={reading || uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleFile(file);
              }
            }}
          />

          <div className="upload-help">
            Hỗ trợ Excel/CSV. Cột: <strong>makiot / ten / giaban</strong> hoặc{" "}
            <strong>product_code / product_name / sale_price</strong>.
          </div>
        </div>

        {fileName && (
          <div className="file-line">
            <div>
              <span>File đã chọn</span>
              <strong>{fileName}</strong>
            </div>

            {!uploading && (
              <button
                type="button"
                className="secondary-button"
                onClick={resetSelection}
              >
                Chọn lại
              </button>
            )}
          </div>
        )}

        {reading && <div className="info-box">Đang đọc và kiểm tra file...</div>}

        {errors.length > 0 && (
          <div className="error-box">
            <strong>File có lỗi:</strong>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="summary-grid">
              <div>
                <span>Dòng hợp lệ</span>
                <strong>{formatNumber(rows.length)}</strong>
              </div>
              <div>
                <span>Mã trùng</span>
                <strong>0</strong>
              </div>
              <div>
                <span>Thiếu mã/tên</span>
                <strong>0</strong>
              </div>
            </div>

            <div className="preview-wrap">
              <div className="preview-title">Xem trước 5 dòng</div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Mã SP</th>
                      <th>Tên SP</th>
                      <th>Giá bán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>{row.productCode}</td>
                        <td>{row.productName}</td>
                        <td>
                          {row.salePrice === null
                            ? "-"
                            : formatNumber(row.salePrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {uploading && (
              <div className="progress-wrap">
                <div className="progress-line">
                  <span>Đang xử lý</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-bar"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="progress-detail">
                  {formatNumber(uploadedRows)} / {formatNumber(rows.length)} dòng
                  đã upload
                </div>
              </div>
            )}

            <button
              type="button"
              className="danger-button"
              disabled={uploading || reading}
              onClick={() => setConfirming(true)}
            >
              {uploading ? "Đang cập nhật DATA..." : "Cập nhật DATA"}
            </button>
          </>
        )}

        {message && (
          <div
            className={
              errors.length > 0 ? "message message-error" : "message"
            }
          >
            {message}
          </div>
        )}
      </section>

      {result && (
        <section className="catalog-card">
          <h2>Kết quả cập nhật</h2>

          <div className="result-grid">
            <div>
              <span>Tổng DATA mới</span>
              <strong>
                {formatNumber(Number(result.finalCatalogCount ?? 0))}
              </strong>
            </div>
            <div>
              <span>Thêm mới</span>
              <strong>
                {formatNumber(Number(result.catalogInserted ?? 0))}
              </strong>
            </div>
            <div>
              <span>Cập nhật</span>
              <strong>
                {formatNumber(Number(result.catalogUpdated ?? 0))}
              </strong>
            </div>
            <div>
              <span>Xóa khỏi DATA</span>
              <strong>
                {formatNumber(Number(result.catalogDeleted ?? 0))}
              </strong>
            </div>
            <div>
              <span>SP HSD đồng bộ</span>
              <strong>
                {formatNumber(Number(result.productsSynced ?? 0))}
              </strong>
            </div>
            <div>
              <span>Giá cũ đã bỏ</span>
              <strong>
                {formatNumber(Number(result.staleProductsCleared ?? 0))}
              </strong>
            </div>
          </div>

          <div className="success-box">
            DATA cũ đã được thay theo file mới. Tên và giá của sản phẩm đang
            theo dõi cũng đã được đồng bộ từ DATA mới.
          </div>
        </section>
      )}

      {confirming && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setConfirming(false);
            }
          }}
        >
          <div className="confirm-modal">
            <h3>Xác nhận thay toàn bộ DATA?</h3>
            <p>
              File mới có <strong>{formatNumber(rows.length)}</strong> dòng. Khi
              hoàn tất, các mã không còn trong file mới sẽ bị xóa khỏi DATA.
            </p>
            <p>
              Sản phẩm HSD có mã còn tồn tại sẽ được cập nhật{" "}
              <strong>tên và giá mới</strong> ngay lập tức.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirming(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void performImport()}
              >
                Xác nhận cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .catalog-card {
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          box-shadow: var(--shadow-sm);
          margin-bottom: 18px;
        }
        .catalog-card h2 { margin: 0 0 6px; }
        .catalog-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .catalog-card-header p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.5;
        }
        .catalog-count {
          min-width: 150px;
          padding: 12px 14px;
          border-radius: 12px;
          background: var(--kk-red-soft);
          color: var(--kk-red);
        }
        .catalog-count span,
        .summary-grid span,
        .result-grid span {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }
        .catalog-count strong { font-size: 24px; }
        .upload-box {
          border: 2px dashed var(--border-strong);
          border-radius: 12px;
          padding: 18px;
          background: #fafafa;
        }
        .upload-box input { width: 100%; font-size: 14px; }
        .upload-help {
          margin-top: 10px;
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-secondary);
        }
        .file-line {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-top: 14px;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .file-line span {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
        }
        .file-line strong { overflow-wrap: anywhere; }
        .summary-grid,
        .result-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
        }
        .summary-grid > div,
        .result-grid > div {
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: #fafafa;
        }
        .summary-grid strong,
        .result-grid strong { font-size: 20px; }
        .preview-wrap { margin-top: 16px; }
        .preview-title { font-weight: 800; margin-bottom: 8px; }
        .table-scroll {
          overflow-x: auto;
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 680px;
        }
        th, td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
          font-size: 13px;
        }
        th { background: #f5f6f7; font-weight: 800; }
        .progress-wrap {
          margin-top: 16px;
          padding: 14px;
          border: 1px solid var(--border);
          border-radius: 10px;
        }
        .progress-line {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .progress-track {
          height: 10px;
          border-radius: 999px;
          overflow: hidden;
          background: #eceff2;
        }
        .progress-bar {
          height: 100%;
          background: var(--kk-red);
          transition: width 0.2s ease;
        }
        .progress-detail {
          margin-top: 7px;
          color: var(--text-secondary);
          font-size: 12px;
        }
        .danger-button,
        .secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          border-radius: 8px;
          padding: 8px 15px;
          font-weight: 800;
          cursor: pointer;
        }
        .danger-button {
          margin-top: 16px;
          border: 1px solid var(--kk-red);
          background: var(--kk-red);
          color: #ffffff;
        }
        .danger-button:disabled { opacity: 0.6; cursor: not-allowed; }
        .secondary-button {
          border: 1px solid var(--border-strong);
          background: #ffffff;
          color: var(--foreground);
        }
        .info-box,
        .message,
        .success-box,
        .error-box {
          margin-top: 14px;
          padding: 11px 12px;
          border-radius: 9px;
          line-height: 1.5;
        }
        .info-box,
        .message {
          border: 1px solid var(--border);
          background: #f7f8fa;
        }
        .success-box {
          border: 1px solid #a8d8b8;
          background: var(--success-soft);
          color: var(--success);
          font-weight: 700;
        }
        .error-box,
        .message-error {
          border: 1px solid #f1b5b5;
          background: var(--danger-soft);
          color: var(--danger);
        }
        .error-box ul { margin: 8px 0 0; padding-left: 20px; }
        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(0, 0, 0, 0.48);
        }
        .confirm-modal {
          width: min(520px, 100%);
          background: #ffffff;
          border-radius: 14px;
          padding: 20px;
          box-shadow: var(--shadow-lg);
        }
        .confirm-modal h3 { margin: 0 0 10px; font-size: 20px; }
        .confirm-modal p {
          color: var(--text-secondary);
          line-height: 1.55;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 18px;
        }
        .modal-actions .danger-button { margin-top: 0; }
        @media (max-width: 720px) {
          .catalog-card { padding: 14px; }
          .summary-grid,
          .result-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .catalog-count { width: 100%; }
          .modal-actions { flex-direction: column-reverse; }
          .modal-actions button { width: 100%; }
        }
      `}</style>
    </>
  );
}
