"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";


export default function ModuleMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const scan = pathname.startsWith("/dashboard/scan");

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const switchModule = () => {
    // Không dựng overlay loading toàn màn hình khi đổi module.
    // Next.js tự xử lý điều hướng; tránh overlay cũ chồng lên lần chuyển tiếp theo.
    setOpen(false);
  };

  return (
    <>
      <div className="module-menu" ref={menuRef}>
        <button type="button" className="module-menu-trigger" aria-label="Mở menu chức năng" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="module-menu-icon"><i /><i /><i /></span> MENU
        </button>
        {open && <>
          <nav className="module-menu-panel" aria-label="Chuyển module">
            <div className="module-menu-heading">CHỨC NĂNG</div>
            <Link href="/dashboard" className={!scan ? "module-menu-link active" : "module-menu-link"} onClick={switchModule}><b>QUẢN LÍ</b><small>AUTO CHECK DATE</small></Link>
            <Link href="/dashboard/scan" className={scan ? "module-menu-link active" : "module-menu-link"} onClick={switchModule}><b>SẢN PHẨM</b><small>SCAN BARCODE</small></Link>
          </nav>
        </>}
      </div>
    </>
  );
}
