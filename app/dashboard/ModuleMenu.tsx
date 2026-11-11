"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ModuleMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const scan = pathname.startsWith("/dashboard/scan");
  return (
    <div className="module-menu">
      <button type="button" className="module-menu-trigger" aria-label="Mở menu chức năng" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="module-menu-icon"><i /><i /><i /></span> MENU
      </button>
      {open && <>
        <button type="button" className="module-menu-dismiss" aria-label="Đóng menu" onClick={() => setOpen(false)} />
        <nav className="module-menu-panel" aria-label="Chuyển module">
          <div className="module-menu-heading">CHỨC NĂNG</div>
          <Link href="/dashboard" className={!scan ? "module-menu-link active" : "module-menu-link"} onClick={() => setOpen(false)}><b>QUẢN LÍ</b><small>AUTO CHECK DATE</small></Link>
          <Link href="/dashboard/scan" className={scan ? "module-menu-link active" : "module-menu-link"} onClick={() => setOpen(false)}><b>SẢN PHẨM</b><small>SCAN BARCODE</small></Link>
        </nav>
      </>}
    </div>
  );
}
