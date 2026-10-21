import { useState } from "react";
import { BrandMark } from "./BrandMark";

const NAVIGATION = {
  USER: [
    { href: "/rides/search", label: "Search rides" },
    { href: "/bookings", label: "My bookings" },
  ],
  DRIVER: [
    { href: "/rides/search", label: "Search rides" },
    { href: "/rides/post", label: "Post a ride" },
    { href: "/rides/mine", label: "My rides" },
    { href: "/driver/requests", label: "Ride requests" },
    { href: "/bookings", label: "My bookings" },
    { href: "/vehicles", label: "Vehicle register" },
    { href: "/documents", label: "Documents" },
  ],
  ADMIN: [
    { href: "/admin", label: "Operations overview" },
    { href: "/vehicles", label: "Vehicle register" },
    { href: "/admin/verifications", label: "Vehicle review" },
    { href: "/admin/drivers", label: "Driver review" },
    { href: "/documents", label: "Documents" },
    { href: "/rides/search", label: "Rides" },
    { href: "/bookings", label: "Bookings" },
    { href: "/admin/pricing", label: "Commission" },
    { href: "/admin/promo-codes", label: "Promo codes" },
  ],
};

const ROLE_LABELS = { USER: "User", DRIVER: "Driver", ADMIN: "Administrator" };

function isCurrentRoute(pathname, href) {
  if (pathname === href) return true;
  if (href === "/rides/search" && /^\/rides\/[^/]+(?:\/track)?$/.test(pathname))
    return true;
  if (
    href === "/bookings" &&
    (/^\/payments\/[^/]+$/.test(pathname) ||
      /^\/receipts\/[^/]+$/.test(pathname))
  )
    return true;
  return pathname.startsWith(`${href}/`);
}

export function WorkspaceSidebar({ user, signOut, pathname: currentPath }) {
  const links = NAVIGATION[user.role] || NAVIGATION.USER;
  const pathname = window.location.pathname;
  const [mobileOpen, setMobileOpen] = useState(false);

  const initials = (user.name || "U")
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Mobile top navigation bar */}
      <div className="mobile-workspace-bar">
        <BrandMark compact />
        <div className="mobile-workspace-bar__actions">
          <span className="mobile-role-pill">{ROLE_LABELS[user.role] || user.role}</span>
          <button
            type="button"
            className="mobile-menu-toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2.2" fill="none">
              {mobileOpen ? (
                <path d="M18 6L6 18M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Backdrop for mobile drawer */}
      {mobileOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar */}
      <aside className={`workspace-sidebar${mobileOpen ? " is-mobile-open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark compact />
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <div className="sidebar-rule" />

        <div className="sidebar-section-header">
          <p className="sidebar-label">
            {user.role === "ADMIN" ? "ADMINISTRATION" : "WORKSPACE"}
          </p>
          <span className="sidebar-status-dot" aria-hidden="true" />
        </div>

        <nav aria-label="Main navigation" className="sidebar-nav">
          {links.map((link, index) => {
            const current = isCurrentRoute(pathname, link.href);
            return (
              <a
                aria-current={current ? "page" : undefined}
                className={`sidebar-nav__link${current ? " is-current" : ""}`}
                href={link.href}
                key={link.href}
                onClick={() => setMobileOpen(false)}
              >
                <span className="nav-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="nav-label">{link.label}</span>
                {current && <span className="nav-indicator" aria-hidden="true" />}
              </a>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <span className="sidebar-note__index">
            DRIVEHIRE <span className="accent-tag">● {user.role}</span>
          </span>
          <p>
            {user.role === "ADMIN"
              ? "Operations and verification records."
              : user.role === "DRIVER"
                ? "Your rides and vehicle records."
                : "Find a ride and manage your bookings."}
          </p>
        </div>

        <div className="sidebar-user">
          <span className="user-monogram">{initials}</span>
          <span className="sidebar-user__identity">
            <strong>{user.name}</strong>
            <small>{ROLE_LABELS[user.role] || user.role}</small>
          </span>
          <button className="signout-button" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
