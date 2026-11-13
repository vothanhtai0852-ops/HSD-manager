
"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ModuleMenu from "../ModuleMenu";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

type ScanSession = {
  id: string;
  user_id: string;
  username_snapshot: string;
  status: "DRAFT" | "COMPLETED";
  created_at: string;
  completed_at: string | null;
};

type ScanItem = {
  id: string;
  product_code: string;
  product_name: string;
  quantity: number;
  note: string | null;
  location_note: string;
  created_at: string;
  updated_at: string;
};

type ScanQueueItem = {
  code: string;
  locationNote: string;
  sessionId: string;
};

type CameraControls = { stop: () => void };

type ScanConfirmDialog = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
};

async function readApiResponse(response: Response): Promise<Record<string, any>> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {
      error: `Máy chủ không trả nội dung (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`,
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, any>;
    }
    return { error: "Phản hồi API không đúng định dạng." };
  } catch {
    return { error: raw.slice(0, 300) || `Phản hồi API không hợp lệ (HTTP ${response.status}).` };
  }
}

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export default function ScanBarcodeClient({
  username,
  userId,
}: {
  username: string;
  userId: string;
}) {
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [session, setSession] = useState<ScanSession | null>(null);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ScanConfirmDialog | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const [manualCode, setManualCode] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [edits, setEdits] = useState<
    Record<string, { quantity: string }>
  >({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const pendingCountsRef = useRef<Record<string, number>>({});
  const activeSessionIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const cameraControlsRef = useRef<CameraControls | null>(null);
  const scanResetTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const processingRef = useRef(false);
  const scanQueueRef = useRef<ScanQueueItem[]>([]);
  const locationNoteRef = useRef("");
  const lastCodeRef = useRef("");
  const lastSeenRef = useRef(0);

  const loadSessions = useCallback(async () => {
    const response = await fetch("/api/scan", { cache: "no-store" });
    const json = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(json.error || "Không tải được lịch sử.");
    }

    setSessions(json.sessions || []);
    return (json.sessions || []) as ScanSession[];
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const response = await fetch(`/api/scan/${id}`, {
      cache: "no-store",
    });
    const json = await readApiResponse(response);

    if (!response.ok) {
      if (response.status === 405) {
        throw new Error("API chi tiết phiên đang trả HTTP 405: bản deploy chưa có phương thức GET của /api/scan/[sessionId]. Hãy cập nhật đúng file route.ts và deploy lại.");
      }
      throw new Error(json.error || `Không tải được phiên (HTTP ${response.status}).`);
    }

    activeSessionIdRef.current = id;
    setSession(json.session);
    setItems(json.items || []);
    pendingCountsRef.current = {};
    setPendingCounts({});

    setEdits(
      Object.fromEntries(
        (json.items || []).map((item: ScanItem) => [
          item.id,
          { quantity: String(item.quantity) },
        ])
      )
    );
  }, []);

  useEffect(() => {
    if (
      !loading &&
      session?.status === "DRAFT" &&
      session.user_id === userId
    ) {
      manualInputRef.current?.focus();
    }
  }, [loading, session?.id, session?.status, session?.user_id, userId]);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  const updatePendingCount = useCallback((code: string, delta: number) => {
    const next = { ...pendingCountsRef.current };
    const count = Math.max(0, (next[code] || 0) + delta);
    if (count === 0) delete next[code];
    else next[code] = count;
    pendingCountsRef.current = next;
    setPendingCounts(next);
  }, []);

  const createSession = useCallback(async () => {
    const response = await fetch("/api/scan", {
      method: "POST",
    });
    const json = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(json.error || "Không tạo được phiên.");
    }

    setSessions((old) => [
      json.session,
      ...old.filter((row) => row.id !== json.session.id),
    ]);
    await loadSession(json.session.id);

    setMessage("Đã tạo phiên kiểm hàng mới.");
    setError("");
  }, [loadSession]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await loadSessions();

        if (cancelled) return;

        const ownActive = list.find(
          (row) => row.status === "DRAFT" && row.user_id === userId
        );

        if (ownActive) {
          await loadSession(ownActive.id);
        } else {
          await createSession();
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Không tải được dữ liệu."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [createSession, loadSession, loadSessions, userId]);

  const stopCamera = useCallback(() => {
    cameraControlsRef.current?.stop();
    cameraControlsRef.current = null;

    if (scanResetTimerRef.current !== null) {
      clearInterval(scanResetTimerRef.current);
    }

    scanResetTimerRef.current = null;

    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;

    stream?.getTracks().forEach((track) => track.stop());

    if (video) video.srcObject = null;

    lastCodeRef.current = "";
    lastSeenRef.current = 0;

    setCameraOn(false);
    setCameraVisible(false);
    window.setTimeout(() => manualInputRef.current?.focus(), 0);
  }, []);

  useEffect(
    () => () => {
      cameraControlsRef.current?.stop();

      if (scanResetTimerRef.current !== null) {
        clearInterval(scanResetTimerRef.current);
      }

      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());

      void audioContextRef.current?.close();
      audioContextRef.current = null;
    },
    []
  );

  // Chuẩn bị âm thanh sau thao tác của người dùng.
  const prepareAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

      if (!AudioContextClass) return;

      audioContextRef.current = new AudioContextClass();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, []);

  // Thành công: một tiếng bíp cao.
  // Thất bại: hai tiếng bíp trầm.
  const playScanSound = useCallback((success: boolean) => {
    const context = audioContextRef.current;

    if (!context || context.state !== "running") return;

    const playTone = (
      frequency: number,
      startTime: number,
      duration: number
    ) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(
        frequency,
        startTime
      );

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(
        0.45,
        startTime + 0.01
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        startTime + duration
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.02);
    };

    const now = context.currentTime;

    if (success) {
      playTone(1100, now, 0.13);
    } else {
      playTone(420, now, 0.16);
      playTone(320, now + 0.22, 0.16);
    }
  }, []);

  // Cập nhật ghi chú vị trí đồng bộ.
  const changeLocationNote = useCallback((value: string) => {
    locationNoteRef.current = value;
    setLocationNote(value);
  }, []);

  const processScanQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setBusy(true);

    try {
      while (scanQueueRef.current.length) {
        const nextItem = scanQueueRef.current.shift()!;

        try {
          const response = await fetch(
            `/api/scan/${nextItem.sessionId}/items`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                productCode: nextItem.code,
                locationNote: nextItem.locationNote,
              }),
            }
          );
          const json = await readApiResponse(response);
          if (!response.ok) {
            throw new Error(json.error || `Không thể thêm mã ${nextItem.code}.`);
          }

          const item = json.item as ScanItem;
          updatePendingCount(nextItem.code, -1);

          if (activeSessionIdRef.current === nextItem.sessionId) {
            setItems((old) => {
              const index = old.findIndex(
                (row) => row.id === item.id || row.product_code === item.product_code
              );
              if (index < 0) return [...old, item];
              const next = [...old];
              next[index] = item;
              return next;
            });
            setEdits((old) => ({
              ...old,
              [item.id]: { quantity: String(item.quantity) },
            }));
            setMessage(`Đã quét ${item.product_code}, số lượng ${item.quantity}.`);
          }
          playScanSound(true);
        } catch (err) {
          updatePendingCount(nextItem.code, -1);
          playScanSound(false);
          setMessage("");
          setError(
            err instanceof Error ? err.message : `Không thể quét ${nextItem.code}.`
          );
        }
      }
    } finally {
      processingRef.current = false;
      setBusy(false);
    }
  }, [playScanSound, updatePendingCount]);

  const addCode = useCallback(
    (raw: string) => {
      const code = raw.trim();
      const currentSession = session;
      if (
        !code ||
        !currentSession ||
        currentSession.status !== "DRAFT" ||
        currentSession.user_id !== userId
      ) return;

      scanQueueRef.current.push({
        code,
        locationNote: locationNoteRef.current.trim(),
        sessionId: currentSession.id,
      });
      updatePendingCount(code, 1);
      setError("");
      setMessage(`Đã nhận mã ${code}, đang cập nhật số lượng...`);
      void processScanQueue();
    },
    [session, userId, processScanQueue, updatePendingCount]
  );

  const startCamera = useCallback(async () => {
    setCameraError("");
    setCameraVisible(true);

    if (!window.isSecureContext) {
      setCameraError(
        "Camera chỉ hoạt động trên HTTPS. Hãy mở website bằng địa chỉ https://."
      );
      setCameraVisible(false);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Trình duyệt không cấp quyền camera. Hãy mở trang bằng Safari trên iPhone hoặc Chrome trên Android."
      );
      setCameraVisible(false);
      return;
    }

    if (!videoRef.current) {
      setCameraError(
        "Không tìm thấy khung camera. Hãy tải lại trang."
      );
      setCameraVisible(false);
      return;
    }

    try {
      await prepareAudio().catch(() => {});

      lastCodeRef.current = "";
      lastSeenRef.current = 0;

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, false);
      const reader = new BrowserMultiFormatReader(hints, {
        // Re-run decoding quickly after both a successful and failed attempt.
        delayBetweenScanSuccess: 100,
        delayBetweenScanAttempts: 100,
      });

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 960 },
            height: { ideal: 540 },
            frameRate: { ideal: 30, max: 30 },
          },
        },
        videoRef.current,
        (result) => {
          if (!result) return;

          const code = result.getText().trim();
          if (!code) return;

          const now = Date.now();
          lastSeenRef.current = now;

          if (code !== lastCodeRef.current) {
            lastCodeRef.current = code;
            void addCode(code);
          }
        }
      );

      cameraControlsRef.current = controls;

      scanResetTimerRef.current = setInterval(() => {
        if (
          lastCodeRef.current &&
          Date.now() - lastSeenRef.current > 400
        ) {
          lastCodeRef.current = "";
        }
      }, 100);

      setCameraOn(true);
      setError("");
      window.requestAnimationFrame(() => manualInputRef.current?.focus());
    } catch (err) {
      stopCamera();
      setCameraVisible(false);

      const cameraErr = err as DOMException;

      if (
        cameraErr?.name === "NotAllowedError" ||
        cameraErr?.name === "PermissionDeniedError"
      ) {
        setCameraError(
          "Bạn chưa cấp quyền camera. Hãy cho phép Camera trong cài đặt trình duyệt rồi thử lại."
        );
      } else if (
        cameraErr?.name === "NotFoundError" ||
        cameraErr?.name === "DevicesNotFoundError"
      ) {
        setCameraError("Không tìm thấy camera trên thiết bị.");
      } else if (
        cameraErr?.name === "NotReadableError" ||
        cameraErr?.name === "TrackStartError"
      ) {
        setCameraError(
          "Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại."
        );
      } else if (cameraErr?.name === "OverconstrainedError") {
        setCameraError(
          "Không mở được camera sau theo cấu hình yêu cầu. Hãy thử lại hoặc kiểm tra quyền camera."
        );
      } else {
        setCameraError(
          err instanceof Error
            ? err.message
            : "Không thể mở camera. Kiểm tra HTTPS và quyền camera của trình duyệt."
        );
      }
    }
  }, [addCode, stopCamera, prepareAudio]);

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const code = manualCode.trim();
    if (!code) return;

    void prepareAudio().catch(() => {});
    addCode(code);
    setManualCode("");
    window.requestAnimationFrame(() => manualInputRef.current?.focus());
  }

  async function saveItem(item: ScanItem) {
    const edit = edits[item.id];

    const response = await fetch(
      `/api/scan/${session?.id}/items/${item.id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quantity: Number(edit?.quantity),
        }),
      }
    );

    const json = await readApiResponse(response);

    if (!response.ok) {
      throw new Error(json.error || "Không lưu được.");
    }

    setItems((old) =>
      old.map((row) =>
        row.id === item.id ? json.item : row
      )
    );

    setEdits((old) => ({
      ...old,
      [item.id]: {
        quantity: String(json.item.quantity),
      },
    }));

    setMessage(`Đã lưu ${item.product_code}.`);
  }

  function deleteItem(item: ScanItem) {
    setConfirmDialog({
      title: "Xóa sản phẩm đã quét?",
      description: `Xóa mã ${item.product_code} tại vị trí "${item.location_note || "Chưa ghi chú"}" khỏi phiên kiểm hàng?`,
      confirmLabel: "Xóa sản phẩm",
      danger: true,
      onConfirm: async () => {
        const response = await fetch(
          `/api/scan/${session?.id}/items/${item.id}`,
          { method: "DELETE" }
        );
        const json = await readApiResponse(response);
        if (!response.ok) {
          throw new Error(json.error || `Không xóa được (HTTP ${response.status}).`);
        }

        setItems((old) => old.filter((row) => row.id !== item.id));
        setEdits((old) => {
          const next = { ...old };
          delete next[item.id];
          return next;
        });
        setMessage(`Đã xóa mã ${item.product_code}.`);
      },
    });
  }

  async function performCompleteSession() {
    if (!session || session.status !== "DRAFT") return;
    setBusy(true);
    try {
      const response = await fetch(`/api/scan/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "COMPLETE" }),
      });
      const json = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(json.error || `Không lưu được phiên (HTTP ${response.status}).`);
      }

      setSession(json.session);
      setSessions((old) => old.map((row) => row.id === json.session.id ? json.session : row));
      stopCamera();
      setMessage("Đã lưu phiên kiểm hàng.");
      setError("");
    } finally {
      setBusy(false);
    }
  }

  function completeSession() {
    if (!session || session.status !== "DRAFT") return;
    setConfirmDialog({
      title: "Lưu và khóa phiên kiểm hàng?",
      description: "Sau khi lưu, phiên này sẽ bị khóa và không thể tiếp tục thêm hoặc sửa sản phẩm.",
      confirmLabel: "Lưu phiên",
      onConfirm: performCompleteSession,
    });
  }

  async function performNewSession(activeOwnSession?: ScanSession) {
    if (activeOwnSession) {
      const response = await fetch(`/api/scan/${activeOwnSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "COMPLETE" }),
      });
      const json = await readApiResponse(response);
      if (!response.ok) {
        throw new Error(json.error || `Không thể đóng phiên hiện tại (HTTP ${response.status}).`);
      }
      setSessions((old) => old.map((row) => row.id === json.session.id ? json.session : row));
    }

    stopCamera();
    await createSession();
  }

  function newSession() {
    const activeOwnSession = sessions.find(
      (row) => row.user_id === userId && row.status === "DRAFT"
    );

    if (activeOwnSession) {
      setConfirmDialog({
        title: "Tạo phiên kiểm hàng mới?",
        description: "Phiên đang kiểm sẽ được lưu và khóa trước khi mở phiên mới. Dữ liệu đã quét được giữ lại.",
        confirmLabel: "Tạo phiên mới",
        onConfirm: () => performNewSession(activeOwnSession),
      });
      return;
    }

    void performNewSession().catch((err) => {
      setError(err instanceof Error ? err.message : "Không thể tạo phiên mới.");
    });
  }

  async function runConfirmAction() {
    const dialog = confirmDialog;
    if (!dialog || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await dialog.onConfirm();
      setConfirmDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thực hiện được thao tác.");
      setConfirmDialog(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  

async function downloadExcel() {
  if (!session) return;

  const response = await fetch(
    `/api/scan/${session.id}/export`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    const raw = await response.text();
    let message = raw;

    try {
      const json = JSON.parse(raw);
      message = json.error || raw;
    } catch {
      // Giữ nguyên nội dung lỗi từ server.
    }

    throw new Error(
      message || `Không xuất được Excel (HTTP ${response.status}).`
    );
  }

  // Lấy tên file chính thức từ API.
  // Tuyệt đối không tự lấy tên người đang đăng nhập.
  const disposition =
    response.headers.get("Content-Disposition") || "";

  const filenameMatch = disposition.match(
    /filename\s*=\s*"?([^";]+)"?/i
  );

  const filename = filenameMatch?.[1]?.trim();

  if (!filename || !filename.startsWith("SCAN_BARCODE_")) {
    throw new Error(
      "API chưa trả tên file theo chủ nhân phiên."
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}



  const displayedItems: ScanItem[] = [
    ...items.map((item) => ({
      ...item,
      quantity: item.quantity + (pendingCounts[item.product_code] || 0),
    })),
    ...Object.entries(pendingCounts)
      .filter(([code, count]) => count > 0 && !items.some((item) => item.product_code === code))
      .map(([code, count]) => ({
        id: `pending-${code}`,
        product_code: code,
        product_name: "Đang đồng bộ sản phẩm...",
        quantity: count,
        note: null,
        location_note: locationNote,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })),
  ];

  const total = displayedItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  if (loading) {
    return (
      <section className="scan-card">
        Đang tải dữ liệu kiểm hàng...
      </section>
    );
  }

  return (
    <>
      <header className="scan-topbar">
        <div className="scan-topbar-left">
          <ModuleMenu />
          <div>
            <div className="scan-brand">KINGKONG MART</div>
            <div className="scan-module-title">
              SẢN PHẨM / SCAN BARCODE
            </div>
            <div className="scan-user">
              Tài khoản: {username}
            </div>
          </div>
        </div>

       
        
      </header>

      <section className="scan-card">
        <div className="scan-section-heading">
          <div>
            <h1>Quét mã sản phẩm</h1>
          </div>

          <span
            className={`scan-status ${
              session?.status === "DRAFT"
                ? "is-active"
                : session?.status === "COMPLETED"
                  ? "is-complete"
                  : "is-loading"
            }`}
          >
            {loading ? "ĐANG TẢI" : session?.status === "DRAFT"
              ? "ĐANG KIỂM"
              : session?.status === "COMPLETED"
                ? "ĐÃ LƯU"
                : "CHƯA TẢI ĐƯỢC"}
          </span>
        </div>

        <div className="scan-toolbar">
          <label className="scan-session-select">
            <span>Phiên kiểm hàng / lịch sử</span>
            <select
              value={session?.id || ""}
              disabled={busy}
              onChange={(e) => {
                stopCamera();
                loadSession(e.target.value).catch((err) =>
                  setError(err.message)
                );
              }}
            >
              {sessions.map((row) => (
                <option key={row.id} value={row.id}>
                  {dateLabel(row.created_at)} ·{" "}
                  {row.username_snapshot} ·{" "}
                  {row.status === "DRAFT"
                    ? "Đang kiểm"
                    : "Đã lưu"}
                </option>
              ))}
            </select>
          </label>

          <div className="scan-toolbar-actions">
            <button
              type="button"
              onClick={newSession}
              disabled={busy}
            >
              + Phiên mới
            </button>

            <button
              type="button"
              onClick={() =>
                downloadExcel().catch((err) =>
                  setError(err.message)
                )
              }
              disabled={!session || displayedItems.length === 0}
            >
              Xuất Excel
            </button>

            {session?.status === "DRAFT" &&
              session.user_id === userId && (
                <button
                  type="button"
                  className="kk-button-primary"
                  onClick={completeSession}
                  disabled={busy}
                >
                  Lưu phiên
                </button>
              )}
          </div>
        </div>

        {/* VỊ TRÍ QUÉT DÙNG CHUNG */}
        <div className="scan-location-panel">
          <label htmlFor="scan-location-note">Vị trí Scan</label>
          <input
            id="scan-location-note"
            type="text"
            value={locationNote}
            maxLength={500}
            placeholder="Ví dụ: Kệ A1, quầy nước..."
            disabled={!session || session.status !== "DRAFT" || session.user_id !== userId}
            onChange={(e) => changeLocationNote(e.target.value)}
          />
        </div>

        <div className={`scan-camera-layout ${cameraVisible ? "camera-visible" : ""}`}>
          {/* NHẬP MÃ THỦ CÔNG */}
          <div className="scan-manual-panel">
            <h2>Nhập mã thủ công</h2>

            <form
              className="scan-manual-form"
              onSubmit={submitManual}
            >
              <input
                ref={manualInputRef}
                autoFocus
                value={manualCode}
                onChange={(e) =>
                  setManualCode(e.target.value)
                }
                placeholder="Nhập / dán mã sản phẩm"
                autoComplete="off"
                disabled={
                  !session ||
                  session.status !== "DRAFT" ||
                  session.user_id !== userId
                }
              />

              <button
                type="submit"
                className="kk-button-primary"
                disabled={
                  !manualCode.trim() ||
                  !session ||
                  session.status !== "DRAFT" ||
                  session.user_id !== userId
                }
              >
                Thêm mã
              </button>
            </form>
          </div>

          {/* CAMERA CHỈ MỞ KHI NGƯỜI DÙNG NHẤN NÚT */}
          <div className={`scan-camera-panel ${cameraVisible ? "is-visible" : "is-collapsed"}`}>
            <video
              ref={videoRef}
              className={cameraOn ? "scan-video active" : "scan-video"}
              muted
              playsInline
            />
            {!cameraOn && (
              <div className="scan-camera-placeholder">
                <div className="scan-camera-symbol">▦</div>
                <strong>Đang kết nối camera...</strong>
              </div>
            )}
            {cameraOn && (
              <div className="scan-camera-actions">
                <button type="button" onClick={stopCamera}>Tắt camera</button>
              </div>
            )}
          </div>
        </div>

        {!cameraVisible && (
          <div className="scan-camera-launch">
            <button
              type="button"
              className="kk-button-primary"
              onClick={startCamera}
              disabled={!session || session.status !== "DRAFT" || session.user_id !== userId}
            >
              Mở camera
            </button>
          </div>
        )}
        {cameraError && (
          <p className="scan-inline-warning scan-camera-error">{cameraError}</p>
        )}

        {error ? (
          <div className="scan-toast scan-toast-error" role="status" aria-live="assertive">
            {error}
          </div>
        ) : message ? (
          <div className="scan-toast scan-toast-success" role="status" aria-live="polite">
            {message}
          </div>
        ) : null}

        {confirmDialog && (
          <div
            className="scan-confirm-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !confirmBusy) {
                setConfirmDialog(null);
              }
            }}
          >
            <section
              className="scan-confirm-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="scan-confirm-title"
              aria-describedby="scan-confirm-description"
            >
              <div className="scan-confirm-mark">!</div>
              <h2 id="scan-confirm-title">{confirmDialog.title}</h2>
              <p id="scan-confirm-description">{confirmDialog.description}</p>
              <div className="scan-confirm-actions">
                <button
                  type="button"
                  className="scan-confirm-cancel"
                  disabled={confirmBusy}
                  onClick={() => setConfirmDialog(null)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className={confirmDialog.danger ? "scan-confirm-submit is-danger" : "scan-confirm-submit"}
                  disabled={confirmBusy}
                  onClick={() => void runConfirmAction()}
                >
                  {confirmBusy ? "Đang xử lý..." : confirmDialog.confirmLabel}
                </button>
              </div>
            </section>
          </div>
        )}

        <div className="scan-summary">
          <div>
            <span>Dòng sản phẩm</span>
            <strong>{displayedItems.length}</strong>
          </div>

          <div>
            <span>Tổng số lượng</span>
            <strong>
              {total.toLocaleString("vi-VN")}
            </strong>
          </div>
        </div>

        <div className="scan-items-heading">
          <h2>Danh sách đã quét</h2>
          <span>{displayedItems.length} dòng</span>
        </div>

        {displayedItems.length === 0 ? (
          <div className="scan-empty">
            Chưa có sản phẩm. Bật camera hoặc nhập mã để
            bắt đầu.
          </div>
        ) : (
          <div className="scan-table-wrap">
            <table className="scan-table">
              <thead>
                <tr>
                  <th>Mã sản phẩm</th>
                  <th>Tên sản phẩm</th>
                  <th>Số lượng</th>
                  <th>Ghi chú vị trí</th>
                  <th>Thao tác</th>
                </tr>
              </thead>

              <tbody>
                {displayedItems.map((item) => {
                  const edit = edits[item.id] || {
                    quantity: String(item.quantity),
                  };

                  return (
                    <tr key={item.id}>
                      <td className="scan-code">
                        {item.product_code}
                      </td>

                      <td>{item.product_name}</td>

                      <td>
                        <input
                          className="scan-quantity-input"
                          type="number"
                          min="1"
                          max="1000000"
                          step="1"
                          value={
                            (pendingCounts[item.product_code] || 0) > 0
                              ? String(item.quantity)
                              : edit.quantity
                          }
                          disabled={
                            item.id.startsWith("pending-") ||
                            (pendingCounts[item.product_code] || 0) > 0 ||
                            session?.status !== "DRAFT" ||
                            session.user_id !== userId
                          }
                          onChange={(e) =>
                            setEdits((old) => ({
                              ...old,
                              [item.id]: { quantity: e.target.value },
                            }))
                          }
                          onBlur={() => {
                            if (!item.id.startsWith("pending-") && Number(edit.quantity) !== item.quantity) {
                              saveItem(item).catch((err) => setError(err.message));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                        />
                      </td>

                      <td>
                        {item.location_note || "—"}
                      </td>

                      <td>
                        {session?.status === "DRAFT" &&
                          session.user_id === userId &&
                          !item.id.startsWith("pending-") && (
                            <div className="scan-row-actions">
                              <button
                                type="button"
                                className="scan-delete-button"
                                disabled={(pendingCounts[item.product_code] || 0) > 0}
                                onClick={() => deleteItem(item)}
                              >
                                Xóa
                              </button>
                            </div>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
