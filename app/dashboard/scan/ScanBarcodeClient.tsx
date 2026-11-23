
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

type ScanApiResponse = {
  error?: string;
  sessions?: ScanSession[];
  session: ScanSession;
  items?: ScanItem[];
  item: ScanItem;
};

async function readApiResponse(response: Response): Promise<ScanApiResponse> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {
      error: `Máy chủ không trả nội dung (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`,
    } as ScanApiResponse;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ScanApiResponse;
    }
    return { error: "Phản hồi API không đúng định dạng." } as ScanApiResponse;
  } catch {
    const looksLikeHtml = /<!doctype html|<html[\s>]/i.test(raw);
    if (looksLikeHtml) {
      return {
        error: `Máy chủ trả về trang HTML thay vì dữ liệu API (HTTP ${response.status}). Có thể route chưa được deploy đúng hoặc đường dẫn API không tồn tại.`,
      } as ScanApiResponse;
    }
    return { error: `Phản hồi API không hợp lệ (HTTP ${response.status}).` } as ScanApiResponse;
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
  role,
  displayName,
}: {
  username: string;
  userId: string;
  role: "ADMIN" | "MANAGER" | "USER";
  displayName: string;
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
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);
  const sessionPanelRef = useRef<HTMLDivElement>(null);
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
  const cameraStartingRef = useRef(false);
  const scanResetTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const processingRef = useRef(false);
  const scanQueueRef = useRef<ScanQueueItem[]>([]);
  const confirmedQuantitiesRef = useRef<Record<string, number>>({});
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
    confirmedQuantitiesRef.current = Object.fromEntries(
      (json.items || []).map((item: ScanItem) => [item.product_code, item.quantity])
    );
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
    if (!sessionPanelOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (sessionPanelRef.current && !sessionPanelRef.current.contains(event.target as Node)) {
        setSessionPanelOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [sessionPanelOpen]);

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
    return count;
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

  const refocusCamera = useCallback(() => {
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as
      | (MediaTrackCapabilities & { focusMode?: string[] })
      | undefined;

    if (!track || !capabilities?.focusMode?.includes("single-shot")) {
      setCameraError("Thiết bị không hỗ trợ lấy nét lại bằng trình duyệt. Hãy đưa mã gần camera hơn và giữ yên.");
      return;
    }

    setCameraError("");
    void track
      .applyConstraints({ advanced: [{ focusMode: "single-shot" } as MediaTrackConstraintSet] })
      .then(() => {
        window.setTimeout(() => {
          if (track.readyState === "live" && capabilities.focusMode?.includes("continuous")) {
            void track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
          }
        }, 900);
      })
      .catch(() => setCameraError("Không thể lấy nét lại. Hãy lau ống kính, đưa mã gần hơn hoặc khởi động lại camera."));
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
          confirmedQuantitiesRef.current[item.product_code] = item.quantity;
          const remainingForCode = updatePendingCount(nextItem.code, -1);
          const visibleQuantity = item.quantity + remainingForCode;

          if (activeSessionIdRef.current === nextItem.sessionId) {
            setItems((old) => {
              const index = old.findIndex(
                (row) => row.id === item.id || row.product_code === item.product_code
              );
              if (index < 0) return [item, ...old];
              const next = [...old];
              next[index] = item;
              return next;
            });
            setEdits((old) => ({
              ...old,
              [item.id]: { quantity: String(item.quantity) },
            }));
            setError("");
            setMessage(
              remainingForCode > 0
                ? `\u0110\u00e3 qu\u00e9t ${item.product_code}, s\u1ed1 l\u01b0\u1ee3ng hi\u1ec7n t\u1ea1i ${visibleQuantity} (\u0111\u00e3 l\u01b0u ${item.quantity}, \u0111ang x\u1eed l\u00fd ${remainingForCode}).`
                : `\u0110\u00e3 qu\u00e9t ${item.product_code}, s\u1ed1 l\u01b0\u1ee3ng hi\u1ec7n t\u1ea1i ${visibleQuantity}.`
            );
          }
          playScanSound(true);
        } catch (err) {
          const remainingForCode = updatePendingCount(nextItem.code, -1);
          const visibleQuantity =
            (confirmedQuantitiesRef.current[nextItem.code] || 0) + remainingForCode;
          playScanSound(false);
          setMessage("");
          setError(
            `${err instanceof Error ? err.message : `Không thể quét ${nextItem.code}.`} Số lượng hiện tại ${visibleQuantity}.`
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
    if (cameraStartingRef.current || cameraControlsRef.current) return;
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

    cameraStartingRef.current = true;
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

      const onDecode = (result: { getText: () => string } | undefined) => {
        if (!result) return;

        const code = result.getText().trim();
        if (!code) return;

        const now = Date.now();
        lastSeenRef.current = now;

        if (code !== lastCodeRef.current) {
          lastCodeRef.current = code;
          void addCode(code);
        }
      };
      const environmentConstraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
        },
      };

      let controls = await reader.decodeFromConstraints(
        environmentConstraints,
        videoRef.current,
        onDecode
      );

      // Labels become available after camera permission is granted. If Chrome
      // selected an explicitly ultra-wide lens, switch sequentially to a main
      // rear camera so two streams are never open at once.
      if (/Android/i.test(navigator.userAgent)) {
        try {
          const stream = videoRef.current.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()[0];
          const activeDeviceId = track?.getSettings().deviceId;
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cameras = devices.filter((device) => device.kind === "videoinput");
          const activeCamera = cameras.find((device) => device.deviceId === activeDeviceId);
          const isUltraWide = /ultra.?wide|ultrawide|0[.,]5x|0\.5/i.test(activeCamera?.label ?? "");
          const mainRearCamera = cameras.find((device) =>
            device.deviceId !== activeDeviceId &&
            /back|rear|environment/i.test(device.label) &&
            !/ultra.?wide|ultrawide|0[.,]5x|0\.5/i.test(device.label)
          );

          if (isUltraWide && mainRearCamera) {
            controls.stop();
            stream?.getTracks().forEach((track) => track.stop());
            const mainCameraConstraints: MediaStreamConstraints = {
              ...environmentConstraints,
              video: {
                ...(environmentConstraints.video as MediaTrackConstraints),
                deviceId: { exact: mainRearCamera.deviceId },
              },
            };
            try {
              controls = await reader.decodeFromConstraints(
                mainCameraConstraints,
                videoRef.current,
                onDecode
              );
            } catch {
              // Keep scanning on the environment-facing default if a device ID
              // becomes unavailable between enumeration and camera startup.
              controls = await reader.decodeFromConstraints(
                environmentConstraints,
                videoRef.current,
                onDecode
              );
            }
          }
        } catch {
          // Device enumeration is optional; continue with the rear-camera stream.
        }
      }

      cameraControlsRef.current = controls;

      // Prefer continuous autofocus and neutral 1x zoom where the device supports them.
      if (/Android/i.test(navigator.userAgent)) {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        const track = stream?.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & {
          zoom?: { min: number; max: number; step?: number };
          focusMode?: string[];
        }) | undefined;
        if (track && capabilities?.zoom && capabilities.zoom.min <= 1 && capabilities.zoom.max >= 1) {
          void track.applyConstraints({ advanced: [{ zoom: 1 } as MediaTrackConstraintSet] }).catch(() => {});
        }
        if (track && capabilities?.focusMode?.includes("continuous")) {
          void track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        }
      }

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
    } finally {
      cameraStartingRef.current = false;
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

    confirmedQuantitiesRef.current[item.product_code] = json.item.quantity;
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
        const previousItems = items;
        const previousEdits = edits;
        // Optimistic UI: remove the row immediately, then roll back only on failure.
        setItems((old) => old.filter((row) => row.id !== item.id));
        setEdits((old) => {
          const next = { ...old };
          delete next[item.id];
          return next;
        });
        try {
          const response = await fetch(
            `/api/scan/${session?.id}/items/${item.id}`,
            { method: "DELETE" }
          );
          const json = await readApiResponse(response);
          if (!response.ok) throw new Error(json.error || `Không xóa được (HTTP ${response.status}).`);
          delete confirmedQuantitiesRef.current[item.product_code];
          setMessage(`Đã xóa mã ${item.product_code}.`);
        } catch (deleteError) {
          setItems(previousItems);
          setEdits(previousEdits);
          throw deleteError;
        }
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

  function deleteSession(row: ScanSession) {
    setConfirmDialog({
      title: "Xóa phiên kiểm hàng?",
      description: `Xóa phiên ngày ${dateLabel(row.created_at)} và toàn bộ sản phẩm bên trong? Không thể khôi phục.`,
      confirmLabel: "Xóa phiên",
      danger: true,
      onConfirm: async () => {
        const response = await fetch(`/api/scan/${row.id}`, { method: "DELETE" });
        const json = await readApiResponse(response);
        if (!response.ok) throw new Error(json.error || "Không thể xóa phiên.");
        const remaining = sessions.filter((item) => item.id !== row.id);
        setSessions(remaining);
        if (session?.id === row.id) {
          stopCamera();
          activeSessionIdRef.current = null;
          setSession(null);
          setItems([]);
          if (remaining.length) await loadSession(remaining[0].id);
          else await createSession();
        }
        setMessage("Đã xóa phiên kiểm hàng.");
      },
    });
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
      <header className="scan-topbar dashboard-scan-header">
        <div className="scan-topbar-left">
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
        <ModuleMenu username={username} role={role} currentDisplayName={displayName} />
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
          <div className="scan-session-module" ref={sessionPanelRef}>
            <button
              type="button"
              className="scan-session-module-trigger"
              aria-expanded={sessionPanelOpen}
              onClick={() => setSessionPanelOpen((open) => !open)}
              disabled={busy}
            >
              <span>PHIÊN KIỂM / LỊCH SỬ</span>
              <span aria-hidden="true">{sessionPanelOpen ? "▴" : "▾"}</span>
            </button>
            {sessionPanelOpen && (
              <>
                <section className="scan-session-module-panel" aria-label="Các phiên kiểm được phép truy cập">
                  <div className="scan-session-module-heading">
                    <div>
                      <strong>DANH SÁCH PHIÊN KIỂM</strong>
                      <small>Các phiên theo quyền tài khoản</small>
                    </div>
                    <span className="scan-session-module-count" aria-label={`${sessions.length} phiên kiểm`}>{sessions.length}</span>
                  </div>
                  {sessions.length === 0 ? (
                    <p className="scan-session-module-empty">Chưa có phiên kiểm.</p>
                  ) : (
                    <div className="scan-session-module-list">
                      {sessions.map((row) => (
                        <div key={row.id} className={`scan-session-module-row ${session?.id === row.id ? "active" : ""}`}>
                          <button
                            type="button"
                            className="scan-session-module-select"
                            onClick={() => {
                              stopCamera();
                              setSessionPanelOpen(false);
                              loadSession(row.id)
                                .then(() => setMessage(`Đã mở phiên kiểm của ${row.username_snapshot}.`))
                                .catch((err) => setError(err.message));
                            }}
                          >
                            <strong>{row.username_snapshot}</strong>
                            <span>{dateLabel(row.created_at)}</span>
                            <small>{row.status === "DRAFT" ? "Đang kiểm" : "Đã lưu"}{session?.id === row.id ? " · ĐANG MỞ" : ""}</small>
                          </button>
                          {row.user_id === userId && (
                            <button
                              type="button"
                              className="scan-session-module-delete"
                              onClick={() => deleteSession(row)}
                              disabled={busy}
                              aria-label={`Xóa phiên ${dateLabel(row.created_at)}`}
                            >Xóa</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>

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
              onClick={refocusCamera}
              aria-label="Chạm để lấy nét lại camera"
            />
            {!cameraOn && (
              <div className="scan-camera-placeholder">
                <div className="scan-camera-symbol">▦</div>
                <strong>Đang kết nối camera...</strong>
              </div>
            )}
            {cameraOn && (
              <div className="scan-camera-actions">
                <button type="button" onClick={refocusCamera}>Lấy nét lại</button>
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
