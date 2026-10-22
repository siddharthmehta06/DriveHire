import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/http";
import { WorkspaceSidebar } from "../../components/WorkspaceSidebar";
import { useAuth } from "../../context/AuthContext";
import { NotificationBell } from "../notifications/NotificationBell";
import { getAdminDashboard } from "./api";

const SECTIONS = [
  { key: "USERS", label: "People" },
  { key: "DRIVERS", label: "Drivers" },
  { key: "VEHICLES", label: "Vehicles" },
  { key: "DOCUMENTS", label: "Documents" },
  { key: "RIDES", label: "Carpool rides" },
  { key: "REVIEWS", label: "Reviews" },
];

const SECTION_STATUS_OPTIONS = {
  USERS: [
    { value: "", label: "All verification states" },
    { value: "VERIFIED", label: "Email verified" },
    { value: "UNVERIFIED", label: "Unverified" },
  ],
  DRIVERS: [
    { value: "", label: "All compliance states" },
    { value: "PENDING", label: "Pending review" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
  ],
  VEHICLES: [
    { value: "", label: "All vehicle statuses" },
    { value: "VERIFIED", label: "Verified" },
    { value: "UNDER_REVIEW", label: "Under review" },
    { value: "UNVERIFIED", label: "Unverified" },
    { value: "REJECTED", label: "Rejected" },
    { value: "EXPIRED", label: "Expired" },
  ],
  DOCUMENTS: [
    { value: "", label: "All document states" },
    { value: "PENDING", label: "Pending review" },
    { value: "APPROVED", label: "Approved" },
    { value: "REJECTED", label: "Rejected" },
  ],
  RIDES: [
    { value: "", label: "All ride statuses" },
    { value: "OPEN", label: "Open" },
    { value: "FULL", label: "Full" },
    { value: "IN_PROGRESS", label: "In progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ],
  REVIEWS: [
    { value: "", label: "All ratings" },
    { value: "5", label: "5 Stars" },
    { value: "4", label: "4 Stars" },
    { value: "3", label: "3 Stars" },
    { value: "2", label: "2 Stars" },
    { value: "1", label: "1 Star" },
  ],
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AdminDashboardPage() {
  const { user, token, signOut } = useAuth();
  const [section, setSection] = useState("USERS");
  const [loadedSection, setLoadedSection] = useState("USERS");
  const currentSectionRef = useRef("USERS");
  const [stats, setStats] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 15;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (targetSection, targetPage, targetQ, targetStatus) => {
      setLoading(true);
      setError("");
      try {
        const result = await getAdminDashboard(token, {
          section: targetSection,
          page: targetPage,
          limit,
          q: targetQ?.trim() || undefined,
          status: targetStatus || undefined,
        });
        if (currentSectionRef.current === targetSection) {
          setStats(result.data.stats);
          setItems(result.data.items);
          setTotal(result.data.total);
          setLoadedSection(targetSection);
        }
      } catch (requestError) {
        if (requestError instanceof ApiError && requestError.status === 401) {
          signOut();
        } else if (currentSectionRef.current === targetSection) {
          setError(requestError.message);
        }
      } finally {
        if (currentSectionRef.current === targetSection) {
          setLoading(false);
        }
      }
    },
    [limit, signOut, token],
  );

  useEffect(() => {
    refresh(section, page, query, statusFilter);
  }, [page, refresh, section, statusFilter]);

  function handleSectionChange(newSection) {
    if (newSection === section) return;
    currentSectionRef.current = newSection;
    setSection(newSection);
    setLoadedSection("");
    setItems([]);
    setTotal(0);
    setLoading(true);
    setPage(1);
    setStatusFilter("");
    setQuery("");
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    setPage(1);
    refresh(section, 1, query, statusFilter);
  }

  const isTableLoading = loading || loadedSection !== section;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="workspace">
      <WorkspaceSidebar signOut={signOut} user={user} />
      <main className="workspace-main" id="admin-operations">
        <header className="workspace-topbar">
          <p>
            DRIVEHIRE <span>/</span> OPERATIONS OVERVIEW
          </p>
          <div className="workspace-topbar__actions">
            <NotificationBell />
            <span className="live-indicator" aria-hidden="true" />
            <span>Administrator access</span>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">ADMINISTRATION</p>
              <h1>Operations overview</h1>
              <p className="page-heading__subtitle">
                System-wide visibility across users, driver applications, fleet vehicles, verification, and trips.
              </p>
            </div>
          </div>

          {error && (
            <div className="inline-alert" role="alert">
              <span>{error}</span>
              <button
                className="text-button"
                onClick={() => refresh(section, page, query, statusFilter)}
                type="button"
              >
                Try again
              </button>
            </div>
          )}

          {/* Dense operational summary strip */}
          <section aria-label="Operational overview metrics" className="summary-strip">
            <div className="summary-item">
              <span className="summary-item__label">USERS REGISTERED</span>
              <strong>{stats ? stats.users : "-"}</strong>
              <span className="summary-item__detail">Excluding administrative accounts</span>
            </div>
            <div className="summary-item">
              <span className="summary-item__label">DRIVERS APPROVED</span>
              <strong>
                {stats ? stats.drivers?.APPROVED || 0 : "-"}
              </strong>
              <span className="summary-item__detail">
                {stats?.drivers?.PENDING ? `${stats.drivers.PENDING} awaiting review` : "All reviewed"}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-item__label">VERIFIED VEHICLES</span>
              <strong>{stats ? stats.vehicles?.VERIFIED || 0 : "-"}</strong>
              <span className="summary-item__detail">
                {stats?.vehicles?.UNDER_REVIEW ? `${stats.vehicles.UNDER_REVIEW} under review` : "Fleet compliant"}
              </span>
            </div>
            <div className="summary-item summary-item--last">
              <span className="summary-item__label">CARPOOL RIDES</span>
              <strong>{stats ? stats.activeRides + stats.upcomingRides : "-"}</strong>
              <span className="summary-item__detail">
                {stats ? `${stats.activeRides} in progress · ${stats.reviews} reviews (${stats.averageRating ? Number(stats.averageRating).toFixed(1) : "—"} ★)` : "Live metrics"}
              </span>
            </div>
          </section>

          {/* Section Selector / Tabs */}
          <nav aria-label="Operations sections" className="register-header" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {SECTIONS.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => handleSectionChange(sec.key)}
                  className={`button button--quiet ${section === sec.key ? "button--primary" : ""}`}
                  style={{
                    fontWeight: section === sec.key ? "600" : "400",
                    borderBottom: section === sec.key ? "2px solid var(--green)" : "none",
                  }}
                  aria-pressed={section === sec.key}
                >
                  {sec.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Section records & controls */}
          <section aria-labelledby="section-records-heading" className="register-section">
            <div className="register-header">
              <div>
                <p className="eyebrow">{section} RECORDS</p>
                <h2 id="section-records-heading">
                  {SECTIONS.find((s) => s.key === section)?.label}{" "}
                  <span>{loading ? "" : String(total).padStart(2, "0")}</span>
                </h2>
              </div>
              <div className="register-controls">
                <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.5rem" }}>
                  <label className="visually-hidden" htmlFor="admin-search-input">
                    Search records
                  </label>
                  <input
                    id="admin-search-input"
                    className="search-input"
                    placeholder={`Search ${section.toLowerCase()}...`}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <button className="button button--quiet" type="submit">
                    Filter
                  </button>
                </form>

                <label className="visually-hidden" htmlFor="admin-status-filter">
                  Filter by status
                </label>
                <select
                  id="admin-status-filter"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  {(SECTION_STATUS_OPTIONS[section] || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Section Tables */}
            <div className="vehicle-table vehicle-table--admin" role="table" aria-label={`${section} table`}>
              {section === "USERS" && (
                <>
                  <div className="vehicle-table__head" role="row">
                    <span role="columnheader">NAME</span>
                    <span role="columnheader">EMAIL</span>
                    <span role="columnheader">PHONE</span>
                    <span role="columnheader">ROLE</span>
                    <span role="columnheader">EMAIL STATUS</span>
                    <span role="columnheader">JOINED</span>
                  </div>
                  {isTableLoading ? (
                    <div className="table-loading">
                      <div className="skeleton-line skeleton-line--wide" />
                      <div className="skeleton-line" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="empty-register">
                      <h3>No user accounts found.</h3>
                      <p>Adjust your search query or status filter.</p>
                    </div>
                  ) : (
                    items.map((u) => (
                      <div className="vehicle-table__row" key={u.id} role="row">
                        <span role="cell"><strong>{u.name || "-"}</strong></span>
                        <span role="cell">{u.email || "-"}</span>
                        <span role="cell">{u.phone || "-"}</span>
                        <span role="cell"><span className="status-pill status-pill--unverified">{u.role || "USER"}</span></span>
                        <span role="cell">
                          <span className={`status-pill status-pill--${u.emailVerified ? "verified" : "rejected"}`}>
                            {u.emailVerified ? "Verified" : "Unverified"}
                          </span>
                        </span>
                        <span className="date-cell" role="cell">{formatDate(u.createdAt)}</span>
                      </div>
                    ))
                  )}
                </>
              )}

              {section === "DRIVERS" && (
                <>
                  <div className="vehicle-table__head" role="row">
                    <span role="columnheader">DRIVER</span>
                    <span role="columnheader">CONTACT</span>
                    <span role="columnheader">COMPLIANCE STATUS</span>
                    <span role="columnheader">LAST UPDATED</span>
                    <span role="columnheader">ACTIONS</span>
                  </div>
                  {isTableLoading ? (
                    <div className="table-loading">
                      <div className="skeleton-line skeleton-line--wide" />
                      <div className="skeleton-line" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="empty-register">
                      <h3>No driver profiles match your criteria.</h3>
                      <p>Adjust your search query or status filter.</p>
                    </div>
                  ) : (
                    items.map((d) => (
                      <div className="vehicle-table__row" key={d.userId || d.id} role="row">
                        <span role="cell"><strong>{d.user?.name || "Driver"}</strong></span>
                        <span role="cell">
                          {d.user?.email || "-"}
                          {d.user?.phone && <small> · {d.user.phone}</small>}
                        </span>
                        <span role="cell">
                          <span className={`status-pill status-pill--${d.backgroundCheckStatus === "APPROVED" ? "verified" : d.backgroundCheckStatus === "REJECTED" ? "rejected" : "under-review"}`}>
                            {d.backgroundCheckStatus || "PENDING"}
                          </span>
                        </span>
                        <span className="date-cell" role="cell">{formatDate(d.updatedAt || d.createdAt)}</span>
                        <div className="row-actions" role="cell">
                          <a className="row-action" href="/admin/drivers">
                            Review
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {section === "VEHICLES" && (
                <>
                  <div className="vehicle-table__head" role="row">
                    <span role="columnheader">VEHICLE</span>
                    <span role="columnheader">ACCOUNT OWNER</span>
                    <span role="columnheader">REGISTRATION</span>
                    <span role="columnheader">VERIFICATION</span>
                    <span role="columnheader">AVAILABILITY</span>
                    <span role="columnheader">ACTIONS</span>
                  </div>
                  {isTableLoading ? (
                    <div className="table-loading">
                      <div className="skeleton-line skeleton-line--wide" />
                      <div className="skeleton-line" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="empty-register">
                      <h3>No vehicles found.</h3>
                      <p>Adjust your search query or status filter.</p>
                    </div>
                  ) : (
                    items.map((v) => {
                      const vStatus = v.verificationStatus || "UNVERIFIED";
                      return (
                        <div className="vehicle-table__row" key={v.id} role="row">
                          <span role="cell">
                            <strong>{v.make || "-"} {v.model || ""}</strong>
                            {v.year && <small> · {v.year}</small>}
                          </span>
                          <span className="admin-owner-cell" role="cell">
                            {v.owner?.name || "-"}
                            <small>{v.owner?.email || ""}</small>
                          </span>
                          <span className="registration-number" role="cell">{v.registrationNumber || "-"}</span>
                          <span role="cell">
                            <span className={`status-pill status-pill--${vStatus.toLowerCase().replaceAll("_", "-")}`}>
                              {vStatus.replace("_", " ")}
                            </span>
                          </span>
                          <span className="availability-cell" role="cell">
                            <span className={`availability-dot${v.isAvailable ? " is-available" : ""}`} />
                            {v.isAvailable ? "Available" : "Unavailable"}
                          </span>
                          <div className="row-actions" role="cell">
                            <a
                              className="row-action"
                              href={vStatus === "UNDER_REVIEW" ? "/admin/verifications" : "/vehicles"}
                            >
                              {vStatus === "UNDER_REVIEW" ? "Review" : "View fleet"}
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {section === "DOCUMENTS" && (
                <>
                  <div className="vehicle-table__head" role="row">
                    <span role="columnheader">TYPE</span>
                    <span role="columnheader">DOCUMENT NUMBER</span>
                    <span role="columnheader">ASSOCIATED ENTITY</span>
                    <span role="columnheader">STATUS</span>
                    <span role="columnheader">EXPIRY</span>
                    <span role="columnheader">ACTIONS</span>
                  </div>
                  {isTableLoading ? (
                    <div className="table-loading">
                      <div className="skeleton-line skeleton-line--wide" />
                      <div className="skeleton-line" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="empty-register">
                      <h3>No documents found.</h3>
                      <p>Adjust your search query or status filter.</p>
                    </div>
                  ) : (
                    items.map((doc) => {
                      const docStatus = doc.status || "PENDING";
                      return (
                        <div className="vehicle-table__row" key={doc.id} role="row">
                          <span role="cell">
                            <strong>{doc.type || "-"}</strong>
                            {doc.insuranceType && <small> ({doc.insuranceType})</small>}
                          </span>
                          <span className="registration-number" role="cell">{doc.documentNumber || "-"}</span>
                          <span role="cell">
                            {doc.vehicle ? (
                              <span>{doc.vehicle.make} {doc.vehicle.model} ({doc.vehicle.registrationNumber})</span>
                            ) : (
                              <span>{doc.owner?.name || "Driver document"}</span>
                            )}
                          </span>
                          <span role="cell">
                            <span className={`status-pill status-pill--${docStatus.toLowerCase().replaceAll("_", "-")}`}>
                              {docStatus}
                            </span>
                          </span>
                          <span className="date-cell" role="cell">{formatDate(doc.expiryDate)}</span>
                          <div className="row-actions" role="cell">
                            <a className="row-action" href="/documents">
                              View register
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {section === "RIDES" && (
                <>
                  <div className="vehicle-table__head" role="row">
                    <span role="columnheader">ROUTE</span>
                    <span role="columnheader">DRIVER</span>
                    <span role="columnheader">VEHICLE</span>
                    <span role="columnheader">DEPARTURE</span>
                    <span role="columnheader">SEATS</span>
                    <span role="columnheader">STATUS</span>
                  </div>
                  {isTableLoading ? (
                    <div className="table-loading">
                      <div className="skeleton-line skeleton-line--wide" />
                      <div className="skeleton-line" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="empty-register">
                      <h3>No carpool rides found.</h3>
                      <p>Adjust your search query or status filter.</p>
                    </div>
                  ) : (
                    items.map((r) => (
                      <div className="vehicle-table__row" key={r.id} role="row">
                        <span role="cell">
                          <strong>{r.originText || "-"} → {r.destText || "-"}</strong>
                          <small> · ₹{Number(r.costPerSeat || 0).toFixed(0)}/seat</small>
                        </span>
                        <span role="cell">{r.driver?.name || "-"}</span>
                        <span role="cell">
                          {r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}` : "-"}
                        </span>
                        <span className="date-cell" role="cell">{formatDateTime(r.departureTime)}</span>
                        <span role="cell">{r.availableSeats ?? "-"} / {r.totalSeats ?? "-"}</span>
                        <span role="cell">
                          <span className={`status-pill status-pill--${r.status === "COMPLETED" ? "verified" : r.status === "CANCELLED" ? "rejected" : "under-review"}`}>
                            {r.status || "OPEN"}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </>
              )}

              {section === "REVIEWS" && (
                <>
                  <div className="vehicle-table__head" role="row">
                    <span role="columnheader">DRIVER</span>
                    <span role="columnheader">REVIEWER</span>
                    <span role="columnheader">RATING</span>
                    <span role="columnheader">COMMENT</span>
                    <span role="columnheader">DATE</span>
                  </div>
                  {isTableLoading ? (
                    <div className="table-loading">
                      <div className="skeleton-line skeleton-line--wide" />
                      <div className="skeleton-line" />
                    </div>
                  ) : items.length === 0 ? (
                    <div className="empty-register">
                      <h3>No driver reviews recorded.</h3>
                      <p>Completed rides with passenger feedback will appear here.</p>
                    </div>
                  ) : (
                    items.map((rev) => {
                      const rating = typeof rev.rating === "number" && !isNaN(rev.rating)
                        ? Math.max(0, Math.min(5, Math.floor(rev.rating)))
                        : 0;
                      return (
                        <div className="vehicle-table__row" key={rev.id} role="row">
                          <span role="cell"><strong>{rev.driver?.name || "-"}</strong></span>
                          <span role="cell">{rev.reviewer?.name || "-"}</span>
                          <span role="cell">
                            <span style={{ color: "var(--ochre)", fontWeight: "600" }}>
                              {"★".repeat(rating)}{"☆".repeat(5 - rating)}
                            </span>
                            <small> ({rating}/5)</small>
                          </span>
                          <span role="cell">{rev.comment || <span style={{ color: "var(--ink-soft)" }}>No comment</span>}</span>
                          <span className="date-cell" role="cell">{formatDate(rev.createdAt)}</span>
                        </div>
                      );
                    })
                  )}
                </>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="register-footnote" style={{ justifyContent: "space-between", marginTop: "1rem" }}>
              <span>
                Showing page {page} of {totalPages} ({total} records total)
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  className="button button--quiet"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  type="button"
                >
                  ← Previous
                </button>
                <button
                  className="button button--quiet"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  type="button"
                >
                  Next →
                </button>
              </div>
            </div>
          </section>

          <footer className="workspace-footer">
            <span>
              DRIVEHIRE <span className="footer-slash">/</span> OPERATIONS CONTROL
            </span>
            <span>
              <a href="/terms">Terms of service</a>
              <a href="/privacy">Privacy policy</a>
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
