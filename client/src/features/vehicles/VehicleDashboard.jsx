import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandMark } from '../../components/BrandMark';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/http';
import {
  createVehicle,
  deleteVehicle,
  listVehicles,
  setVehicleAvailability,
  submitVehicleForVerification,
  updateVehicle,
} from './api';
import { VehicleForm } from './VehicleForm';
import { NotificationBell } from '../notifications/NotificationBell';

const STATUS_LABELS = {
  UNVERIFIED: 'Unverified',
  UNDER_REVIEW: 'Under review',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

const TYPE_LABELS = {
  HATCHBACK: 'Hatchback',
  SEDAN: 'Sedan',
  SUV: 'SUV',
  MPV: 'MPV',
  LUXURY: 'Luxury',
};

function displayDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function StatusPill({ status }) {
  return <span className={`status-pill status-pill--${status.toLowerCase().replace('_', '-')}`}>{STATUS_LABELS[status] || status}</span>;
}

function Dialog({ title, description, onClose, children }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="dialog-title" aria-modal="true" className="dialog-panel" role="dialog">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">VEHICLE REGISTER</p>
            <h2 id="dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button aria-label="Close dialog" className="dialog-close" onClick={onClose} type="button">Close</button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function VehicleDashboard() {
  const { user, token, signOut } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [vehicles, setVehicles] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 100 });
  const [statusFilter, setStatusFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setPageError('');
    try {
      const result = await listVehicles(token, {
        verificationStatus: statusFilter,
        isAvailable: availabilityFilter,
      });
      setVehicles(result.data);
      setMeta(result.meta || { total: result.data.length, page: 1, limit: 100 });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        signOut();
        return;
      }
      setPageError(error.message);
    } finally {
      setLoading(false);
    }
  }, [availabilityFilter, signOut, statusFilter, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const visibleVehicles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return vehicles;
    return vehicles.filter((vehicle) => (
      `${vehicle.make} ${vehicle.model} ${vehicle.registrationNumber} ${vehicle.year}`.toLowerCase().includes(normalizedQuery)
    ));
  }, [query, vehicles]);

  const verifiedCount = vehicles.filter((vehicle) => vehicle.verificationStatus === 'VERIFIED').length;
  const availableCount = vehicles.filter((vehicle) => vehicle.isAvailable).length;
  const reviewCount = vehicles.filter((vehicle) => vehicle.verificationStatus === 'UNDER_REVIEW').length;

  async function saveVehicle({ fields, photos }) {
    setSaving(true);
    setMutationError('');
    try {
      if (modal.vehicle) {
        await updateVehicle(token, modal.vehicle.id, { ...fields, photos });
        setNotice('Vehicle details updated.');
      } else {
        await createVehicle(token, fields, photos);
        setNotice('Vehicle added to your register.');
      }
      setModal(null);
      await refresh();
    } catch (error) {
      setMutationError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeAvailability(vehicle) {
    setMutationError('');
    try {
      await setVehicleAvailability(token, vehicle.id, !vehicle.isAvailable);
      setNotice(vehicle.isAvailable ? 'Vehicle marked unavailable.' : 'Vehicle marked available.');
      setModal(null);
      await refresh();
    } catch (error) {
      setMutationError(error.message);
    }
  }

  async function confirmDelete(vehicle) {
    setSaving(true);
    setMutationError('');
    try {
      await deleteVehicle(token, vehicle.id);
      setNotice('Vehicle removed from the active register.');
      setModal(null);
      await refresh();
    } catch (error) {
      setMutationError(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitForVerification(vehicle) {
    setSaving(true);
    setMutationError('');
    try {
      const result = await submitVehicleForVerification(token, vehicle.id);
      setModal((current) => ({ ...current, vehicle: { ...current.vehicle, ...result.data } }));
      setVehicles((current) => current.map((item) => item.id === vehicle.id ? { ...item, ...result.data } : item));
      setNotice('Vehicle submitted for administrator review.');
    } catch (error) {
      setMutationError(error.message);
    } finally {
      setSaving(false);
    }
  }

  const modalClose = useCallback(() => {
    setModal(null);
    setMutationError('');
  }, []);

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <BrandMark compact />
        <div className="sidebar-rule" />
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <a className="sidebar-nav__link is-current" href="#vehicles">
            <span className="nav-index">01</span>
            <span>Vehicle register</span>
          </a>
          <a className="sidebar-nav__link" href="/documents">
            <span className="nav-index">02</span>
            <span>Documents</span>
          </a>
          <a className="sidebar-nav__link" href="/rides/search">
            <span className="nav-index">05</span>
            <span>Search rides</span>
          </a>
          {user.role === 'DRIVER' && <a className="sidebar-nav__link" href="/rides/post"><span className="nav-index">06</span><span>Post a ride</span></a>}
          {user.role === 'DRIVER' && <a className="sidebar-nav__link" href="/rides/mine"><span className="nav-index">07</span><span>My rides</span></a>}
          {isAdmin && <a className="sidebar-nav__link" href="/admin/verifications"><span className="nav-index">03</span><span>Vehicle review</span></a>}
          {isAdmin && <a className="sidebar-nav__link" href="/admin/drivers"><span className="nav-index">04</span><span>Driver review</span></a>}
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note__index">DH / 01</span>
          <p>{isAdmin ? 'Operations overview' : 'Your mobility, in one place.'}</p>
          <span className="sidebar-note__line" />
        </div>
        <div className="sidebar-user">
          <span className="user-monogram">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="sidebar-user__identity">
            <strong>{user.name}</strong>
            <small>{user.role === 'USER' ? 'Vehicle owner' : user.role.toLowerCase()}</small>
          </span>
          <button className="signout-button" onClick={signOut} type="button">Sign out</button>
        </div>
      </aside>

      <main className="workspace-main" id="vehicles">
        <header className="workspace-topbar">
          <p>DRIVEHIRE <span>/</span> {isAdmin ? 'ADMINISTRATION' : 'MY WORKSPACE'}</p>
          <div className="workspace-topbar__actions">
            <NotificationBell />
            <span className="live-indicator" aria-hidden="true" />
            <span>Workspace active</span>
          </div>
        </header>

        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{isAdmin ? 'FLEET OPERATIONS' : 'YOUR VEHICLES'}</p>
              <h1>{isAdmin ? 'Vehicle overview' : 'Your vehicle register'}</h1>
              <p className="page-heading__subtitle">
                {isAdmin
                  ? 'A clear view of vehicles registered across DriveHire.'
                  : 'Keep your vehicle details accurate and availability up to date.'}
              </p>
            </div>
            {!isAdmin && (
              <button className="button button--primary add-vehicle-button" onClick={() => { setMutationError(''); setModal({ type: 'create' }); }} type="button">
                <span aria-hidden="true">+</span> Add a vehicle
              </button>
            )}
          </div>

          {pageError && (
            <div className="inline-alert" role="alert">
              <span>{pageError}</span>
              <button className="text-button" onClick={refresh} type="button">Try again</button>
            </div>
          )}

          <section aria-label="Vehicle summary" className="summary-strip">
            <div className="summary-item">
              <span className="summary-item__label">REGISTERED VEHICLES</span>
              <strong>{loading ? '-' : meta.total}</strong>
              <span className="summary-item__detail">Across your register</span>
            </div>
            <div className="summary-item">
              <span className="summary-item__label">AVAILABLE NOW</span>
              <strong>{loading ? '-' : availableCount}</strong>
              <span className="summary-item__detail">Ready for a journey</span>
            </div>
            <div className="summary-item">
              <span className="summary-item__label">VERIFIED</span>
              <strong>{loading ? '-' : verifiedCount}</strong>
              <span className="summary-item__detail">Identity and details confirmed</span>
            </div>
            <div className="summary-item summary-item--last">
              <span className="summary-item__label">UNDER REVIEW</span>
              <strong>{loading ? '-' : reviewCount}</strong>
              <span className="summary-item__detail">Awaiting verification</span>
            </div>
          </section>

          <section aria-labelledby="register-heading" className="register-section">
            <div className="register-header">
              <div>
                <p className="eyebrow">FLEET RECORDS</p>
                <h2 id="register-heading">{isAdmin ? 'All vehicles' : 'Registered vehicles'} <span>{loading ? '' : String(meta.total).padStart(2, '0')}</span></h2>
              </div>
              <div className="register-controls">
                <label className="visually-hidden" htmlFor="vehicle-search">Search vehicles</label>
                <input
                  className="search-input"
                  id="vehicle-search"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search vehicles"
                  type="search"
                  value={query}
                />
                <label className="visually-hidden" htmlFor="verification-filter">Filter by verification</label>
                <select id="verification-filter" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
                  <option value="">All statuses</option>
                  {Object.entries(STATUS_LABELS).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                </select>
                <label className="visually-hidden" htmlFor="availability-filter">Filter by availability</label>
                <select id="availability-filter" onChange={(event) => setAvailabilityFilter(event.target.value)} value={availabilityFilter}>
                  <option value="">Any availability</option>
                  <option value="true">Available</option>
                  <option value="false">Unavailable</option>
                </select>
              </div>
            </div>

            <div className={`vehicle-table${isAdmin ? ' vehicle-table--admin' : ''}`} role="table" aria-label={isAdmin ? 'All registered vehicles' : 'Your registered vehicles'}>
              <div className="vehicle-table__head" role="row">
                <span role="columnheader">VEHICLE</span>
                {isAdmin && <span role="columnheader">ACCOUNT OWNER</span>}
                <span role="columnheader">REGISTRATION</span>
                <span role="columnheader">VERIFICATION</span>
                <span role="columnheader">AVAILABILITY</span>
                <span role="columnheader">ADDED</span>
                <span role="columnheader"><span className="visually-hidden">Actions</span></span>
              </div>
              {loading ? (
                <div aria-label="Loading vehicles" className="table-loading">
                  <div className="skeleton-line skeleton-line--wide" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line skeleton-line--short" />
                </div>
              ) : visibleVehicles.length === 0 ? (
                <div className="empty-register">
                  <span className="empty-register__number">01</span>
                  <h3>{vehicles.length ? 'No vehicles match these filters.' : isAdmin ? 'No vehicles registered yet.' : 'Your register starts here.'}</h3>
                  <p>{vehicles.length ? 'Adjust your search or filters to view more records.' : isAdmin ? 'Registered vehicles will appear in this list.' : 'Add your first vehicle to keep its details and availability in one place.'}</p>
                  {!vehicles.length && !isAdmin && <button className="text-button" onClick={() => setModal({ type: 'create' })} type="button">Add a vehicle <span aria-hidden="true">↗</span></button>}
                </div>
              ) : (
                visibleVehicles.map((vehicle, index) => (
                  <div className="vehicle-table__row" key={vehicle.id} role="row">
                    <button className="vehicle-identity" onClick={() => setModal({ type: 'detail', vehicle })} role="cell" type="button">
                      <span className="vehicle-index">{String(index + 1).padStart(2, '0')}</span>
                      <span>
                        <strong>{vehicle.make} {vehicle.model}</strong>
                        <small>{vehicle.year} · {TYPE_LABELS[vehicle.vehicleType] || vehicle.vehicleType}</small>
                      </span>
                    </button>
                    {isAdmin && <span className="admin-owner-cell" role="cell">{vehicle.owner?.name || '-'}<small>{vehicle.owner?.email || ''}</small></span>}
                    <span className="registration-number" role="cell">{vehicle.registrationNumber}</span>
                    <span role="cell"><StatusPill status={vehicle.verificationStatus} /></span>
                    <span className="availability-cell" role="cell">
                      <span className={`availability-dot${vehicle.isAvailable ? ' is-available' : ''}`} />
                      {vehicle.isAvailable ? 'Available' : 'Unavailable'}
                    </span>
                    <span className="date-cell" role="cell">{displayDate(vehicle.createdAt)}</span>
                    <div className="row-actions" role="cell">
                      <button aria-label={`View ${vehicle.make} ${vehicle.model}`} className="row-action" onClick={() => setModal({ type: 'detail', vehicle })} type="button">View</button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="register-footnote">
              <span>RECORDS ARE UPDATED AFTER EVERY CHANGE</span>
              <button className="text-button" onClick={refresh} type="button">Refresh register ↻</button>
            </p>
          </section>

          <footer className="workspace-footer">
            <span>DRIVEHIRE <span className="footer-slash">/</span> MOBILITY, MANAGED.</span>
            <span><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a></span>
          </footer>
        </div>
      </main>

      {notice && <div aria-live="polite" className="toast-message" role="status">{notice}</div>}

      {modal?.type === 'create' && (
        <Dialog description="Add the essential details to your vehicle register." onClose={modalClose} title="Add a vehicle">
          {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
          <VehicleForm onCancel={modalClose} onSave={saveVehicle} saving={saving} />
        </Dialog>
      )}

      {modal?.type === 'edit' && (
        <Dialog description="Update the details associated with this vehicle." onClose={modalClose} title="Edit vehicle">
          {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
          <VehicleForm initialVehicle={modal.vehicle} onCancel={modalClose} onSave={saveVehicle} saving={saving} />
        </Dialog>
      )}

      {modal?.type === 'detail' && (
        <Dialog
          description={`${modal.vehicle.year} · ${TYPE_LABELS[modal.vehicle.vehicleType] || modal.vehicle.vehicleType} · ${modal.vehicle.seatCapacity} passenger seats`}
          onClose={modalClose}
          title={`${modal.vehicle.make} ${modal.vehicle.model}`}
        >
          {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
          <div className="detail-record">
            {modal.vehicle.photoUrls?.length ? (
              <div className="detail-photo-strip">
                {modal.vehicle.photoUrls.map((url) => <img alt={`${modal.vehicle.make} ${modal.vehicle.model}`} key={url} src={url} />)}
              </div>
            ) : (
              <div className="detail-photo-placeholder">
                <span className="eyebrow">VEHICLE PHOTOGRAPHS</span>
                <span>Images can be added to this record.</span>
              </div>
            )}
            <dl className="detail-list">
              {isAdmin && modal.vehicle.owner && (
                <div><dt>Account owner</dt><dd>{modal.vehicle.owner.name} · {modal.vehicle.owner.email}</dd></div>
              )}
              <div><dt>Registration</dt><dd>{modal.vehicle.registrationNumber}</dd></div>
              <div><dt>Verification</dt><dd><StatusPill status={modal.vehicle.verificationStatus} /></dd></div>
              <div><dt>Availability</dt><dd>{modal.vehicle.isAvailable ? 'Available' : 'Unavailable'}</dd></div>
              <div><dt>Added to register</dt><dd>{displayDate(modal.vehicle.createdAt)}</dd></div>
            </dl>
            <div className="detail-placeholder">
              <p className="eyebrow">DOCUMENTS & VERIFICATION</p>
              <p>Manage registration, insurance and driver records in the <a href="/documents">document register</a>.</p>
            </div>
            {!isAdmin && (
              <section aria-label="Vehicle verification timeline" className="owner-verification-timeline">
                <p className="eyebrow">VERIFICATION STATUS</p>
                <ol>
                  {[
                    ['UNVERIFIED', 'Documents required'],
                    ['UNDER_REVIEW', 'Administrator review'],
                    ['VERIFIED', 'Verified for use'],
                  ].map(([status, label], index) => {
                    const currentIndex = modal.vehicle.verificationStatus === 'UNVERIFIED' ? 0
                      : modal.vehicle.verificationStatus === 'UNDER_REVIEW' ? 1
                        : modal.vehicle.verificationStatus === 'VERIFIED' ? 2 : 0;
                    return <li className={index <= currentIndex ? 'is-current' : ''} key={status}><span>{String(index + 1).padStart(2, '0')}</span>{label}</li>;
                  })}
                </ol>
                {['REJECTED', 'EXPIRED'].includes(modal.vehicle.verificationStatus) && (
                  <p className="verification-status-note">{modal.vehicle.verificationStatus === 'REJECTED' ? 'A document was rejected. Update it before resubmitting.' : 'A required document has expired. Upload a current copy before resubmitting.'}</p>
                )}
                {modal.vehicle.verificationStatus !== 'VERIFIED' && modal.vehicle.verificationStatus !== 'UNDER_REVIEW' && (
                  <button className="button button--primary" disabled={saving} onClick={() => submitForVerification(modal.vehicle)} type="button">
                    {saving ? 'Submitting…' : 'Submit for verification'}
                  </button>
                )}
              </section>
            )}
            {isAdmin ? (
              <div className="dialog-actions">
                <button className="button button--quiet" onClick={modalClose} type="button">Close</button>
              </div>
            ) : (
              <div className="dialog-actions dialog-actions--spread">
                <button className="button button--danger-quiet" onClick={() => setModal({ type: 'delete', vehicle: modal.vehicle })} type="button">Remove vehicle</button>
                <div>
                  <button className="button button--quiet" onClick={() => setModal({ type: 'edit', vehicle: modal.vehicle })} type="button">Edit details</button>
                  <button className="button button--primary" onClick={() => changeAvailability(modal.vehicle)} type="button">
                    Mark {modal.vehicle.isAvailable ? 'unavailable' : 'available'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {modal?.type === 'delete' && (
        <Dialog description={`${modal.vehicle.make} ${modal.vehicle.model} (${modal.vehicle.registrationNumber}) will be removed from the active register. Its history is retained.`} onClose={modalClose} title="Remove this vehicle?">
          {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
          <div className="dialog-actions">
            <button className="button button--quiet" onClick={modalClose} type="button">Keep vehicle</button>
            <button className="button button--danger" disabled={saving} onClick={() => confirmDelete(modal.vehicle)} type="button">
              {saving ? 'Removing…' : 'Remove from register'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
