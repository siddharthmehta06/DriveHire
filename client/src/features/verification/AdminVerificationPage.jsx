import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../api/http';
import { BrandMark } from '../../components/BrandMark';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../notifications/NotificationBell';
import {
  approveDriver,
  approveReviewDocument,
  downloadReviewDocument,
  getVehicleReview,
  listDriverReviews,
  listVerificationQueue,
  rejectDriver,
  rejectReviewDocument,
} from './api';

const DOCUMENT_NAMES = {
  RC: 'Registration certificate',
  INSURANCE: 'Insurance policy',
  LICENSE: 'Driving licence',
  PERMIT: 'Permit',
};

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function ReviewShell({ user, signOut, children }) {
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <BrandMark compact />
        <div className="sidebar-rule" />
        <p className="sidebar-label">ADMINISTRATION</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <a className="sidebar-nav__link" href="/"><span className="nav-index">01</span><span>Vehicle overview</span></a>
          <a className="sidebar-nav__link" href="/documents"><span className="nav-index">02</span><span>Documents</span></a>
          <a className="sidebar-nav__link" href="/admin/verifications"><span className="nav-index">03</span><span>Vehicle review</span></a>
          <a className="sidebar-nav__link" href="/admin/drivers"><span className="nav-index">04</span><span>Driver review</span></a>
        </nav>
        <div className="sidebar-note"><span className="sidebar-note__index">DH / ADMIN</span><p>Verification decisions are recorded in the audit trail.</p><span className="sidebar-note__line" /></div>
        <div className="sidebar-user">
          <span className="user-monogram">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="sidebar-user__identity"><strong>{user.name}</strong><small>admin</small></span>
          <button className="signout-button" onClick={signOut} type="button">Sign out</button>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <p>DRIVEHIRE <span>/</span> VERIFICATION OPERATIONS</p>
          <div className="workspace-topbar__actions"><NotificationBell /><span>Administrator access</span></div>
        </header>
        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}

function VehicleReview({ token, vehicle, onDecide, onDownload }) {
  return (
    <div className="verification-review">
      <p className="eyebrow">VEHICLE SUBMISSION</p>
      <h2>{vehicle.make} {vehicle.model}</h2>
      <p>{vehicle.registrationNumber} · {vehicle.year} · {vehicle.owner.name}</p>
      <p className="review-owner-contact"><a href={`mailto:${vehicle.owner.email}`}>{vehicle.owner.email}</a>{vehicle.owner.phone && <span>{vehicle.owner.phone}</span>}</p>
      <div className="verification-document-list">
        {vehicle.documents.map((document) => (
          <article className="verification-document" key={document.id}>
            <div>
              <strong>{DOCUMENT_NAMES[document.type] || document.type}</strong>
              <span>{document.documentNumber}{document.insuranceType ? ` · ${document.insuranceType.toLowerCase()} cover` : ''}</span>
              <small>Valid through {formatDate(document.expiryDate)} · {document.status.toLowerCase()}</small>
              {document.rejectionReason && <small>Prior reason: {document.rejectionReason}</small>}
            </div>
            <div className="verification-actions">
              <button className="text-button" onClick={() => onDownload(document)} type="button">View file</button>
              {document.status === 'PENDING' && !document.supersededAt && (
                <>
                  <button className="text-button" onClick={() => onDecide(document, 'APPROVED')} type="button">Approve</button>
                  <button className="text-button document-delete-action" onClick={() => onDecide(document, 'REJECTED')} type="button">Reject</button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <h3 className="eyebrow verification-audit-heading">VEHICLE AUDIT HISTORY</h3>
      <ol className="verification-audit-list">
        {vehicle.audit.map((entry) => (
          <li key={entry.id}><strong>{entry.action.replaceAll('_', ' ')}</strong><span>{formatDate(entry.createdAt)}{entry.reason ? ` · ${entry.reason}` : ''}</span></li>
        ))}
      </ol>
    </div>
  );
}

function DriverReview({ driver, onDownload, onDecide, onLicenseDecide }) {
  const license = driver.user.vehicleDocuments[0];
  const approvedLicense = license?.status === 'APPROVED' && new Date(license.expiryDate) > new Date();
  return (
    <div className="verification-review">
      <p className="eyebrow">DRIVER APPLICATION</p>
      <h2>{driver.user.name}</h2>
      <p className="review-owner-contact"><a href={`mailto:${driver.user.email}`}>{driver.user.email}</a>{driver.user.phone && <span>{driver.user.phone}</span>}</p>
      <p>License number: {driver.licenseNumber || license?.documentNumber || 'Not supplied'}</p>
      {license ? (
        <article className="verification-document">
          <div>
            <strong>{DOCUMENT_NAMES.LICENSE}</strong>
            <span>{license.documentNumber}</span>
            <small>Valid through {formatDate(license.expiryDate)} · {license.status.toLowerCase()}</small>
          </div>
          <div className="verification-actions">
            <button className="text-button" onClick={() => onDownload(license)} type="button">View file</button>
            {license.status === 'PENDING' && (
              <>
                <button className="text-button" onClick={() => onLicenseDecide(license, 'APPROVED')} type="button">Approve licence</button>
                <button className="text-button document-delete-action" onClick={() => onLicenseDecide(license, 'REJECTED')} type="button">Reject licence</button>
              </>
            )}
            <button className="text-button" disabled={!approvedLicense} onClick={() => onDecide('APPROVED')} type="button">Approve driver</button>
            <button className="text-button document-delete-action" onClick={() => onDecide('REJECTED')} type="button">Reject driver</button>
          </div>
        </article>
      ) : (
        <p className="inline-alert" role="status">An uploaded driver licence is required before approval.</p>
      )}
    </div>
  );
}

export function AdminVerificationPage({ view = 'vehicles' }) {
  const { user, token, signOut } = useAuth();
  const isDrivers = view === 'drivers';
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reasonTarget, setReasonTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async (preferredId = '') => {
    setLoading(true);
    setError('');
    try {
      const result = isDrivers ? await listDriverReviews(token) : await listVerificationQueue(token);
      setItems(result.data);
      const nextId = result.data.some((item) => (isDrivers ? item.userId : item.id) === preferredId)
        ? preferredId
        : isDrivers ? result.data[0]?.userId : result.data[0]?.id;
      setSelectedId(nextId || '');
      if (!nextId) setDetail(null);
      else if (!isDrivers) {
        const record = await getVehicleReview(token, nextId);
        setDetail(record.data);
      } else {
        setDetail(result.data.find((item) => item.userId === nextId) || null);
      }
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) signOut();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [isDrivers, signOut, token]);

  useEffect(() => { refresh(''); }, [refresh]);

  async function selectItem(id) {
    setSelectedId(id);
    setError('');
    if (isDrivers) {
      setDetail(items.find((item) => item.userId === id) || null);
      return;
    }
    try {
      const record = await getVehicleReview(token, id);
      setDetail(record.data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function download(item) {
    setError('');
    try {
      const blob = await downloadReviewDocument(token, item.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.originalName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function decide(target, action) {
    if (action === 'REJECTED') {
      setReasonTarget({ ...target, action });
      setReason('');
      return;
    }
    await persistDecision(target, action);
  }

  async function persistDecision(target, action, rejectionReason = '') {
    setSaving(true);
    setError('');
    try {
      if (isDrivers && target.kind === 'license') {
        if (action === 'APPROVED') await approveReviewDocument(token, target.document.id);
        else await rejectReviewDocument(token, target.document.id, rejectionReason);
      } else if (isDrivers) {
        if (action === 'APPROVED') await approveDriver(token, target.userId);
        else await rejectDriver(token, target.userId, rejectionReason);
      } else if (action === 'APPROVED') {
        await approveReviewDocument(token, target.id);
      } else {
        await rejectReviewDocument(token, target.id, rejectionReason);
      }
      setReasonTarget(null);
      await refresh(selectedId);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  const selectedName = isDrivers ? detail?.user?.name : detail?.registrationNumber;

  return (
    <ReviewShell signOut={signOut} user={user}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{isDrivers ? 'DRIVER COMPLIANCE' : 'VEHICLE DOCUMENT REVIEW'}</p>
          <h1>{isDrivers ? 'Driver applications' : 'Verification queue'}</h1>
          <p className="page-heading__subtitle">Review submitted records and make decisions with a complete audit trail.</p>
        </div>
      </div>
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <div className="verification-workspace">
        <section aria-label={isDrivers ? 'Driver applications' : 'Vehicles awaiting review'} className="verification-queue">
          <div className="section-heading"><div><p className="eyebrow">OLDEST FIRST</p><h2>Awaiting review <span>{String(items.length).padStart(2, '0')}</span></h2></div></div>
          {loading ? <div aria-label="Loading verification queue" className="table-loading"><div className="skeleton-line skeleton-line--wide" /><div className="skeleton-line" /></div> : items.length ? items.map((item, index) => {
            const id = isDrivers ? item.userId : item.id;
            const title = isDrivers ? item.user.name : `${item.make} ${item.model}`;
            const secondary = isDrivers ? item.user.email : `${item.registrationNumber} · ${item.owner.name}`;
            return (
              <button aria-current={selectedId === id ? 'true' : undefined} className={`verification-queue-item${selectedId === id ? ' is-selected' : ''}`} key={id} onClick={() => selectItem(id)} type="button">
                <span className="vehicle-index">{String(index + 1).padStart(2, '0')}</span>
                <span><strong>{title}</strong><small>{secondary}</small></span>
              </button>
            );
          }) : <div className="empty-register"><h3>{isDrivers ? 'No drivers await review.' : 'The verification queue is clear.'}</h3><p>New submissions appear here for administrator review.</p></div>}
        </section>
        <section aria-label="Selected verification record" className="verification-detail">
          {detail ? (
            isDrivers
              ? <DriverReview
                driver={detail}
                onDecide={(action) => decide(detail, action)}
                onDownload={download}
                onLicenseDecide={(document, action) => decide({ kind: 'license', document }, action)}
              />
              : <VehicleReview onDecide={decide} onDownload={download} vehicle={detail} />
          ) : (
            <div className="empty-register"><span className="empty-register__number">REVIEW</span><h3>Select a record</h3><p>Choose an item in the queue to inspect its documents and audit history.</p></div>
          )}
        </section>
      </div>
      {reasonTarget && (
        <div className="dialog-backdrop">
          <section aria-labelledby="verification-reject-title" aria-modal="true" className="dialog-panel" role="dialog">
            <div className="dialog-heading"><div><p className="eyebrow">AUDIT DECISION</p><h2 id="verification-reject-title">Record a rejection reason</h2><p>{selectedName}</p></div></div>
            <label className="form-field"><span>Reason <small className="form-hint">At least 5 characters</small></span><textarea maxLength={500} minLength={5} onChange={(event) => setReason(event.target.value)} required value={reason} /></label>
            <div className="dialog-actions">
              <button className="button button--quiet" disabled={saving} onClick={() => setReasonTarget(null)} type="button">Cancel</button>
              <button className="button button--danger" disabled={saving || reason.trim().length < 5} onClick={() => persistDecision(reasonTarget, reasonTarget.action, reason.trim())} type="button">{saving ? 'Saving…' : 'Confirm rejection'}</button>
            </div>
          </section>
        </div>
      )}
      <footer className="workspace-footer"><span>DRIVEHIRE <span className="footer-slash">/</span> VERIFICATION</span><span><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a></span></footer>
    </ReviewShell>
  );
}
