"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ModuleNotice = { title: string; detail: string };

export default function ModuleMenu() {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<ModuleNotice | null>(null);
  const pathname = usePathname();
  const scan = pathname.startsWith("/dashboard/scan");

  useEffect(() => {
    const raw = window.sessionStorage.getItem("hsd-module-transition");
    if (!raw) return;
    window.sessionStorage.removeItem("hsd-module-transition");
    try {
      const parsed = JSON.parse(raw) as ModuleNotice;
      setNotice(parsed);
      const timer = window.setTimeout(() => setNotice(null), 1800);
      return () => window.clearTimeout(timer);
    } catch {
      window.sessionStorage.removeItem("hsd-module-transition");
    }
  }, [pathname]);

  const switchModule = (target: "auto" | "scan") => {
    if ((target === "scan") === scan) return;
    const next = target === "scan"
      ? { title: "SCAN BARCODE", detail: "Đang mở khu vực kiểm hàng" }
      : { title: "AUTO CHECK", detail: "Đang mở quản lý hạn sử dụng" };
    window.sessionStorage.setItem("hsd-module-transition", JSON.stringify(next));
    setOpen(false);
  };

  return (
    <>
      <div className="module-menu">
        <button type="button" className="module-menu-trigger" aria-label="Mở menu chức năng" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="module-menu-icon"><i /><i /><i /></span> MENU
        </button>
        {open && <>
          <button type="button" className="module-menu-dismiss" aria-label="Đóng menu" onClick={() => setOpen(false)} />
          <nav className="module-menu-panel" aria-label="Chuyển module">
            <div className="module-menu-heading">CHỨC NĂNG</div>
            <Link href="/dashboard" className={!scan ? "module-menu-link active" : "module-menu-link"} onClick={() => switchModule("auto")}><b>QUẢN LÍ</b><small>AUTO CHECK DATE</small></Link>
            <Link href="/dashboard/scan" className={scan ? "module-menu-link active" : "module-menu-link"} onClick={() => switchModule("scan")}><b>SẢN PHẨM</b><small>SCAN BARCODE</small></Link>
          </nav>
        </>}
      </div>
      {notice && (
        <div className="module-transition-overlay" role="status" aria-live="polite">
          <div className="module-transition-card">
            <span className="module-transition-spinner" />
            <strong>{notice.title}</strong>
            <small>{notice.detail}</small>
          </div>
        </div>
      )}
    </>
  );
}
