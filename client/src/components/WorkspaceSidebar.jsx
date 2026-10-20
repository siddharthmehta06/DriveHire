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

  return (
    <aside className="workspace-sidebar">
      <BrandMark compact />
      <div className="sidebar-rule" />
      <p className="sidebar-label">
        {user.role === "ADMIN" ? "ADMINISTRATION" : "WORKSPACE"}
      </p>
      <nav aria-label="Main navigation" className="sidebar-nav">
        {links.map((link, index) => {
          const current = isCurrentRoute(pathname, link.href);
          return (
            <a
              aria-current={current ? "page" : undefined}
              className={`sidebar-nav__link${current ? " is-current" : ""}`}
              href={link.href}
              key={link.href}
            >
              <span className="nav-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{link.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="sidebar-note">
        <span className="sidebar-note__index">DH / {user.role}</span>
        <p>
          {user.role === "ADMIN"
            ? "Operations and verification records."
            : user.role === "DRIVER"
              ? "Your rides and vehicle records."
              : "Find a ride and manage your bookings."}
        </p>
        <span className="sidebar-note__line" />
      </div>
      <div className="sidebar-user">
        <span className="user-monogram">
          {user.name
            .split(/\s+/)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
        </span>
        <span className="sidebar-user__identity">
          <strong>{user.name}</strong>
          <small>{ROLE_LABELS[user.role] || user.role}</small>
        </span>
        <button className="signout-button" onClick={signOut} type="button">
          Sign out
        </button>
      </div>
    </aside>
  );
}
