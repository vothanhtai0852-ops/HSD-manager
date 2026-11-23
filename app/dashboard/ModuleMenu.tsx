"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";
import RenameDisplayNameButton from "./RenameDisplayNameButton";

type MenuIconName = "home" | "scan" | "users" | "data" | "edit" | "logout";

type Props = {
  username: string;
  role: "ADMIN" | "MANAGER" | "USER";
  currentDisplayName: string;
};

function MenuIcon({ name }: { name: MenuIconName }) {
  const paths: Record<MenuIconName, ReactNode> = {
    home: <><path d="m3 8 6-5 6 5v7H6v-5h6v5" /></>,
    scan: <><path d="M3 5V3h3M12 3h3v2M15 12v3h-3M6 15H3v-3" /><path d="M5 7h8v5H5z" /><path d="M7 9v1m2-1v1m2-1v1" /></>,
    users: <><circle cx="7" cy="6" r="3" /><path d="M2 15c0-2.3 2.2-4 5-4s5 1.7 5 4v1H2z" /><path d="M12 4.2a3 3 0 0 1 0 5.7m2 2c1.4.7 2 1.8 2 3.1v1h-3" /></>,
    data: <><ellipse cx="9" cy="4" rx="6" ry="2.5" /><path d="M3 4v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V4M3 9c0 1.4 2.7 2.5 6 2.5S15 10.4 15 9" /></>,
    edit: <><path d="m3 12.5-.7 3.2 3.2-.7L14 6.5 11.5 4z" /><path d="m10.5 5 2.5 2.5" /></>,
    logout: <><path d="M8 3H4v12h4M10 6l4 3-4 3M14 9H7" /></>,
  };

  return <svg viewBox="0 0 18 18" aria-hidden="true">{paths[name]}</svg>;
}

export default function ModuleMenu({ username, role, currentDisplayName }: Props) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <div className="module-menu" ref={menuRef}>
      <button
        type="button"
        className="module-menu-trigger"
        aria-label="Mở menu chức năng"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="module-menu-icon"><i /><i /><i /></span>
        MENU
      </button>

      {open && (
        <nav
          className={`module-menu-panel${collapsed ? " is-collapsed" : ""}`}
          aria-label="Menu chức năng"
        >
          <div className="module-menu-heading">
            <span className="module-menu-mark" aria-hidden="true">H</span>
            <span className="module-menu-heading-copy">
              <strong>HSD MANAGER</strong>
              <small>{currentDisplayName || username} · {role}</small>
            </span>
          </div>

          <div className="module-menu-section-label">MODULE</div>
          <Link href="/dashboard" title="Quản lý HSD" aria-current={!scan ? "page" : undefined} className={`module-menu-link${!scan ? " active" : ""}`} onClick={closeMenu}>
            <MenuIcon name="home" /><span>Quản lý HSD</span><small>AUTO CHECK DATE</small>
          </Link>
          <Link href="/dashboard/scan" title="Quét mã sản phẩm" aria-current={scan ? "page" : undefined} className={`module-menu-link${scan ? " active" : ""}`} onClick={closeMenu}>
            <MenuIcon name="scan" /><span>Quét mã sản phẩm</span><small>SCAN BARCODE</small>
          </Link>

          {(role === "ADMIN" || role === "MANAGER") && (
            <>
              <div className="module-menu-section-label">QUẢN TRỊ</div>
              <Link href="/dashboard/users" title={role === "ADMIN" ? "Tài khoản" : "Nhân viên"} aria-current={pathname.startsWith("/dashboard/users") ? "page" : undefined} className={`module-menu-link${pathname.startsWith("/dashboard/users") ? " active" : ""}`} onClick={closeMenu}>
                <MenuIcon name="users" /><span>{role === "ADMIN" ? "Tài khoản" : "Nhân viên"}</span>
              </Link>
            </>
          )}
          {role === "ADMIN" && (
            <Link href="/dashboard/catalog" title="DATA sản phẩm" aria-current={pathname.startsWith("/dashboard/catalog") ? "page" : undefined} className={`module-menu-link${pathname.startsWith("/dashboard/catalog") ? " active" : ""}`} onClick={closeMenu}>
              <MenuIcon name="data" /><span>DATA sản phẩm</span>
            </Link>
          )}

          <div className="module-menu-divider" />
          <div className="module-menu-action">
            <MenuIcon name="edit" />
            <RenameDisplayNameButton
              currentDisplayName={currentDisplayName}
              className="module-menu-action-button"
            />
          </div>
          <div className="module-menu-action">
            <MenuIcon name="logout" />
            <LogoutButton className="module-menu-action-button is-logout" />
          </div>

          <button
            type="button"
            className="module-menu-collapse"
            aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
            <span className="module-menu-collapse-copy">{collapsed ? "Mở rộng" : "Thu gọn"}</span>
          </button>
        </nav>
      )}
    </div>
  );
}
