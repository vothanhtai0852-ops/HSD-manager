
"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ModuleMenu from "../ModuleMenu";
import { BrowserMultiFormatReader } from "@zxing/browser";

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
};

type CameraControls = { stop: () => void };

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
  const [cameraError, setCameraError] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [edits, setEdits] = useState<
    Record<string, { quantity: string }>
  >({});

  const videoRef = useRef<HTMLVideoElement>(null);
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
    const json = await response.json();

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
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "Không tải được phiên.");
    }

    setSession(json.session);
    setItems(json.items || []);

    setEdits(
      Object.fromEntries(
        (json.items || []).map((item: ScanItem) => [
          item.id,
          { quantity: String(item.quantity) },
        ])
      )
    );
  }, []);

  const createSession = useCallback(async () => {
    const response = await fetch("/api/scan", {
      method: "POST",
    });
    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "Không tạo được phiên.");
    }

    await loadSessions();
    await loadSession(json.session.id);

    setMessage("Đã tạo phiên kiểm hàng mới.");
    setError("");
  }, [loadSession, loadSessions]);

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
        0.15,
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

  const addCode = useCallback(
    async (raw: string) => {
      const code = raw.trim();

      if (
        !code ||
        !session ||
        session.status !== "DRAFT" ||
        session.user_id !== userId
      ) {
        return;
      }

      const capturedLocationNote = locationNoteRef.current.trim();

      scanQueueRef.current.push({
        code,
        locationNote: capturedLocationNote,
      });

      if (processingRef.current) return;

      processingRef.current = true;
      setBusy(true);
      setError("");

      try {
        while (scanQueueRef.current.length) {
          const nextItem = scanQueueRef.current.shift()!;

          try {
            const response = await fetch(
              `/api/scan/${session.id}/items`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  productCode: nextItem.code,
                  locationNote: nextItem.locationNote,
                }),
              }
            );

            const json = await response.json();

            if (!response.ok) {
              throw new Error(
                json.error ||
                  `Không thể thêm mã ${nextItem.code}.`
              );
            }

            const item = json.item as ScanItem;

            playScanSound(true);

            setItems((old) => {
              const index = old.findIndex(
                (row) => row.id === item.id
              );

              if (index < 0) {
                return [...old, item];
              }

              const next = [...old];
              next[index] = item;
              return next;
            });

            setEdits((old) => ({
              ...old,
              [item.id]: {
                quantity: String(item.quantity),
              },
            }));

            setMessage(
              `Đã quét ${item.product_code}, số lượng ${item.quantity}.`
            );
          } catch (err) {
            playScanSound(false);

            setError(
              err instanceof Error
                ? err.message
                : `Không thể quét ${nextItem.code}.`
            );
          }
        }
      } finally {
        processingRef.current = false;
        setBusy(false);
      }
    },
    [session, userId, playScanSound]
  );

  const startCamera = useCallback(async () => {
    setCameraError("");

    if (!window.isSecureContext) {
      setCameraError(
        "Camera chỉ hoạt động trên HTTPS. Hãy mở website bằng địa chỉ https://."
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Trình duyệt không cấp quyền camera. Hãy mở trang bằng Safari trên iPhone hoặc Chrome trên Android."
      );
      return;
    }

    if (!videoRef.current) {
      setCameraError(
        "Không tìm thấy khung camera. Hãy tải lại trang."
      );
      return;
    }

    try {
      await prepareAudio().catch(() => {});

      lastCodeRef.current = "";
      lastSeenRef.current = 0;

      const reader = new BrowserMultiFormatReader();

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
          Date.now() - lastSeenRef.current > 1200
        ) {
          lastCodeRef.current = "";
        }
      }, 250);

      setCameraOn(true);
      setError("");
    } catch (err) {
      stopCamera();

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

    await prepareAudio().catch(() => {});
    await addCode(code);
    setManualCode("");
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

    const json = await response.json();

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

  async function deleteItem(item: ScanItem) {
    if (
      !window.confirm(
        `Xóa mã ${item.product_code} tại vị trí "${item.location_note || "Chưa ghi chú"}" khỏi phiên?`
      )
    ) {
      return;
    }

    const response = await fetch(
      `/api/scan/${session?.id}/items/${item.id}`,
      {
        method: "DELETE",
      }
    );

    const json = await response.json();

    if (!response.ok) {
      throw new Error(json.error || "Không xóa được.");
    }

    setItems((old) =>
      old.filter((row) => row.id !== item.id)
    );

    setEdits((old) => {
      const next = { ...old };
      delete next[item.id];
      return next;
    });
  }

  async function completeSession() {
    if (
      !session ||
      session.status !== "DRAFT" ||
      !window.confirm("Lưu và khóa phiên kiểm hàng này?")
    ) {
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `/api/scan/${session.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "COMPLETE" }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || "Không lưu được phiên."
        );
      }

      setSession(json.session);
      await loadSessions();
      stopCamera();
      setMessage("Đã lưu phiên kiểm hàng.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không lưu được phiên."
      );
    } finally {
      setBusy(false);
    }
  }

  async function newSession() {
    const activeOwnSession = sessions.find(
      (row) =>
        row.user_id === userId &&
        row.status === "DRAFT"
    );

    if (
      activeOwnSession &&
      !window.confirm(
        "Tạo phiên mới sẽ lưu và khóa phiên đang kiểm hiện tại. Tiếp tục?"
      )
    ) {
      return;
    }

    if (activeOwnSession) {
      const response = await fetch(
        `/api/scan/${activeOwnSession.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "COMPLETE" }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || "Không thể đóng phiên hiện tại."
        );
      }
    }

    stopCamera();
    await createSession();
  }

  async function downloadExcel() {
    if (!session) return;

    const response = await fetch(
      `/api/scan/${session.id}/export`
    );

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(
        json.error || "Không xuất được Excel."
      );
    }

    const url = URL.createObjectURL(
      await response.blob()
    );

    const a = document.createElement("a");
    a.href = url;

    a.download = `SCAN_BARCODE_${new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    )
      .format(new Date())
      .replaceAll("-", "")}.xlsx`;

    a.click();
    URL.revokeObjectURL(url);
  }

  const total = items.reduce(
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
                : "is-complete"
            }`}
          >
            {session?.status === "DRAFT"
              ? "ĐANG KIỂM"
              : "ĐÃ LƯU"}
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
              onClick={() =>
                newSession().catch((err) =>
                  setError(err.message)
                )
              }
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
              disabled={!session || items.length === 0}
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

        {/* GHI CHÚ VỊ TRÍ DÙNG CHUNG */}
        <div className="scan-location-panel">
          <label>
            <strong style={{ fontSize: "21px" }}>
              vị trí Scan
            </strong>

            <input
              type="text"
              value={locationNote}
              maxLength={500}
              placeholder=""
              disabled={
                !session ||
                session.status !== "DRAFT" ||
                session.user_id !== userId
              }
              onChange={(e) =>
                changeLocationNote(e.target.value)
              }
              style={{
                fontSize: "20px",
                minHeight: "54px",
                padding: "12px 16px",
                marginTop: "10px",
              }}
            />
          </label>
        </div>

        <div className="scan-camera-layout">
          {/* NHẬP MÃ THỦ CÔNG */}
          <div className="scan-manual-panel">
            <h2>Nhập mã thủ công</h2>

            <form
              className="scan-manual-form"
              onSubmit={submitManual}
            >
              <input
                value={manualCode}
                onChange={(e) =>
                  setManualCode(e.target.value)
                }
                placeholder="Nhập / dán mã sản phẩm"
                autoComplete="off"
                disabled={
                  !session ||
                  session.status !== "DRAFT" ||
                  session.user_id !== userId ||
                  busy
                }
              />

              <button
                type="submit"
                className="kk-button-primary"
                disabled={
                  !manualCode.trim() ||
                  !session ||
                  session.status !== "DRAFT" ||
                  session.user_id !== userId ||
                  busy
                }
              >
                Thêm mã
              </button>
            </form>
          </div>

          {/* CAMERA QUÉT MÃ */}
          <div className="scan-camera-panel">
            <video
              ref={videoRef}
              className={
                cameraOn
                  ? "scan-video active"
                  : "scan-video"
              }
              muted
              playsInline
            />

            {!cameraOn && (
              <div className="scan-camera-placeholder">
                <div className="scan-camera-symbol">▦</div>
                <strong>Camera quét mã vạch</strong>
              </div>
            )}

            <div className="scan-camera-actions">
              {!cameraOn ? (
                <button
                  type="button"
                  className="kk-button-primary"
                  onClick={startCamera}
                  disabled={
                    !session ||
                    session.status !== "DRAFT" ||
                    session.user_id !== userId
                  }
                >
                  Mở camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                >
                  Tắt camera
                </button>
              )}
            </div>

            {cameraError && (
              <p className="scan-inline-warning">
                {cameraError}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="scan-message error">
            {error}
          </div>
        )}

        {message && (
          <div className="scan-message success">
            {message}
          </div>
        )}

        <div className="scan-summary">
          <div>
            <span>Dòng sản phẩm</span>
            <strong>{items.length}</strong>
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
          <span>{items.length} dòng</span>
        </div>

        {items.length === 0 ? (
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
                {items.map((item) => {
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
                          value={edit.quantity}
                          disabled={
                            session?.status !== "DRAFT" ||
                            session.user_id !== userId
                          }
                          onChange={(e) =>
                            setEdits((old) => ({
                              ...old,
                              [item.id]: {
                                quantity: e.target.value,
                              },
                            }))
                          }
                        />
                      </td>

                      <td>
                        {item.location_note || "—"}
                      </td>

                      <td>
                        {session?.status === "DRAFT" &&
                          session.user_id === userId && (
                            <div className="scan-row-actions">
                              <button
                                type="button"
                                onClick={() =>
                                  saveItem(item).catch((err) =>
                                    setError(err.message)
                                  )
                                }
                              >
                                Lưu
                              </button>

                              <button
                                type="button"
                                className="scan-delete-button"
                                onClick={() =>
                                  deleteItem(item).catch((err) =>
                                    setError(err.message)
                                  )
                                }
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
