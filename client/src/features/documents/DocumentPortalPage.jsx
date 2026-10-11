import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../api/http';
import { BrandMark } from '../../components/BrandMark';
import { useAuth } from '../../context/AuthContext';
import { NotificationBell } from '../notifications/NotificationBell';
import { listVehicles } from '../vehicles/api';
import { deleteDocument, downloadDocument, listDocuments, uploadDocument } from './api';

const DOCUMENT_TYPES = [
  { value: 'RC', label: 'Registration certificate', scope: 'vehicle' },
  { value: 'INSURANCE', label: 'Insurance policy', scope: 'vehicle' },
  { value: 'LICENSE', label: 'Driving licence', scope: 'driver' },
  { value: 'PERMIT', label: 'Permit', scope: 'driver' },
];

const STATUS_LABELS = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

function dateValue(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function expiryLabel(value) {
  const days = Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
  if (days < 0) return 'Expired';
  if (days === 0) return 'Expires today';
  return `Expires in ${days} day${days === 1 ? '' : 's'}`;
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function DocumentPortalPage() {
  const { user, token, signOut } = useAuth();
  const isAdmin = user.role === 'ADMIN';
  const [vehicles, setVehicles] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [vehicleFilter, setVehicleFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    type: 'RC',
    vehicleId: '',
    documentNumber: '',
    insuranceType: '',
    issueDate: '',
    expiryDate: dateValue(new Date(Date.now() + 86400000)),
    file: null,
  });

  const selectedType = useMemo(() => DOCUMENT_TYPES.find((item) => item.value === form.type), [form.type]);

  const refreshDocuments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters = { includeHistory, type: typeFilter, vehicleId: vehicleFilter };
      const result = await listDocuments(token, filters);
      setDocuments(result.data);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) signOut();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [includeHistory, signOut, token, typeFilter, vehicleFilter]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    if (!isAdmin) {
      listVehicles(token).then((result) => setVehicles(result.data)).catch((requestError) => setError(requestError.message));
    }
  }, [isAdmin, token]);

  const eligibleVehicles = vehicles.filter((vehicle) => !vehicle.deletedAt);
  const visibleTypes = DOCUMENT_TYPES.filter((item) => item.scope === 'vehicle' || user.role === 'DRIVER');

  function changeField(event) {
    const { name, value, files } = event.target;
    setForm((current) => ({ ...current, [name]: name === 'file' ? files?.[0] || null : value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (!form.file) throw new Error('Choose a PDF, JPG or PNG file to upload.');
      if (selectedType.scope === 'vehicle' && !form.vehicleId) throw new Error('Choose the vehicle this document covers.');
      const fields = {
        type: form.type,
        ...(selectedType.scope === 'vehicle' ? { vehicleId: form.vehicleId } : {}),
        documentNumber: form.documentNumber,
        ...(form.type === 'INSURANCE' ? { insuranceType: form.insuranceType } : {}),
        ...(form.issueDate ? { issueDate: form.issueDate } : {}),
        expiryDate: form.expiryDate,
      };
      await uploadDocument(token, fields, form.file);
      setNotice('Document uploaded. The newest copy is now in your document register.');
      setForm((current) => ({ ...current, documentNumber: '', issueDate: '', file: null }));
      event.target.reset();
      await refreshDocuments();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  async function download(item) {
    setError('');
    try {
      const blob = await downloadDocument(token, item.id);
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

  async function remove(item) {
    setError('');
    try {
      await deleteDocument(token, item.id);
      setNotice('Pending or rejected document removed.');
      await refreshDocuments();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <BrandMark compact />
        <div className="sidebar-rule" />
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <a className="sidebar-nav__link" href="/">
            <span className="nav-index">01</span><span>Vehicle register</span>
          </a>
          <a aria-current="page" className="sidebar-nav__link is-current" href="/documents">
            <span className="nav-index">02</span><span>Documents</span>
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note__index">DH / 02</span>
          <p>Current documents, clearly accounted for.</p>
          <span className="sidebar-note__line" />
        </div>
        <div className="sidebar-user">
          <span className="user-monogram">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="sidebar-user__identity"><strong>{user.name}</strong><small>{user.role.toLowerCase()}</small></span>
          <button className="signout-button" onClick={signOut} type="button">Sign out</button>
        </div>
      </aside>

      <main className="workspace-main">
        <header className="workspace-topbar">
          <p>DRIVEHIRE <span>/</span> DOCUMENT REGISTER</p>
          <div className="workspace-topbar__actions"><NotificationBell /><span>Private records</span></div>
        </header>
        <div className="dashboard-content document-page">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{isAdmin ? 'ADMINISTRATIVE ACCESS' : 'VEHICLE & DRIVER RECORDS'}</p>
              <h1>Documents</h1>
              <p className="page-heading__subtitle">Upload secure copies and track document status and validity dates.</p>
            </div>
          </div>

          {error && <div className="inline-alert" role="alert">{error}</div>}
          {notice && <div className="inline-notice" role="status">{notice}</div>}

          {!isAdmin && (
            <section aria-labelledby="document-upload-title" className="document-upload-section">
              <div className="section-heading">
                <div><p className="eyebrow">SECURE FILE INTAKE</p><h2 id="document-upload-title">Add a document</h2></div>
                <span className="document-limit">PDF / JPG / PNG · 10 MB MAX</span>
              </div>
              <form className="document-upload-form" onSubmit={submit}>
                <label className="form-field">
                  <span>Document type</span>
                  <select name="type" onChange={changeField} value={form.type}>
                    {visibleTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                {selectedType.scope === 'vehicle' && (
                  <label className="form-field">
                    <span>Vehicle</span>
                    <select name="vehicleId" onChange={changeField} required value={form.vehicleId}>
                      <option value="">Choose a vehicle</option>
                      {eligibleVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.registrationNumber}</option>)}
                    </select>
                  </label>
                )}
                <label className="form-field">
                  <span>Document number</span>
                  <input autoComplete="off" maxLength="100" name="documentNumber" onChange={changeField} required value={form.documentNumber} />
                </label>
                {form.type === 'INSURANCE' && (
                  <label className="form-field">
                    <span>Insurance class</span>
                    <select name="insuranceType" onChange={changeField} required value={form.insuranceType}>
                      <option value="">Choose insurance class</option>
                      <option value="COMMERCIAL">Commercial</option>
                      <option value="PRIVATE">Private</option>
                    </select>
                  </label>
                )}
                <label className="form-field">
                  <span>Issue date <small className="form-hint">Optional</small></span>
                  <input max={form.expiryDate || undefined} name="issueDate" onChange={changeField} type="date" value={form.issueDate} />
                </label>
                <label className="form-field">
                  <span>Expiry date</span>
                  <input min={dateValue(new Date(Date.now() + 86400000))} name="expiryDate" onChange={changeField} required type="date" value={form.expiryDate} />
                </label>
                <label className="form-field document-file-field">
                  <span>Secure file</span>
                  <input accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" name="file" onChange={changeField} required type="file" />
                </label>
                <div className="document-form-actions">
                  <span>{form.file ? form.file.name : 'Files are stored privately and never served from a public URL.'}</span>
                  <button className="button button--primary" disabled={saving || !eligibleVehicles.length && selectedType.scope === 'vehicle'} type="submit">{saving ? 'Uploading…' : 'Upload document'}</button>
                </div>
              </form>
            </section>
          )}

          <section aria-labelledby="document-list-title" className="register-section document-register">
            <div className="register-header">
              <div><p className="eyebrow">DOCUMENT HISTORY</p><h2 id="document-list-title">Current records <span>{String(documents.length).padStart(2, '0')}</span></h2></div>
              <div className="register-controls document-register-controls">
                <label className="visually-hidden" htmlFor="document-type-filter">Filter by document type</label>
                <select id="document-type-filter" onChange={(event) => setTypeFilter(event.target.value)} value={typeFilter}>
                  <option value="">All document types</option>
                  {DOCUMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <label className="document-history-toggle"><input checked={includeHistory} onChange={(event) => setIncludeHistory(event.target.checked)} type="checkbox" /> Include superseded</label>
              </div>
            </div>
            <div aria-label="Vehicle documents" className="document-table" role="table">
              <div className="document-table__head" role="row">
                <span role="columnheader">DOCUMENT</span><span role="columnheader">NUMBER</span><span role="columnheader">VALID THROUGH</span><span role="columnheader">STATUS</span><span role="columnheader">FILE</span>
              </div>
              {loading ? (
                <div aria-label="Loading documents" className="table-loading"><div className="skeleton-line skeleton-line--wide" /><div className="skeleton-line" /></div>
              ) : documents.length ? documents.map((item) => (
                <div className={`document-table__row${item.supersededAt ? ' is-superseded' : ''}`} key={item.id} role="row">
                  <span className="document-type-cell" role="cell"><strong>{DOCUMENT_TYPES.find((option) => option.value === item.type)?.label || item.type}</strong><small>{item.vehicleId ? vehicles.find((vehicle) => vehicle.id === item.vehicleId)?.registrationNumber || 'Vehicle record' : 'Driver record'}</small></span>
                  <span className="document-number-cell" role="cell">{item.documentNumber}</span>
                  <span className="document-expiry-cell" role="cell"><time dateTime={item.expiryDate}>{displayDate(item.expiryDate)}</time><small>{expiryLabel(item.expiryDate)}</small></span>
                  <span role="cell"><span className={`document-status document-status--${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status]}</span>{item.supersededAt && <small className="superseded-label">Superseded</small>}</span>
                  <span className="document-row-actions" role="cell">
                    <button className="text-button" onClick={() => download(item)} type="button">Download</button>
                    {!isAdmin && ['PENDING', 'REJECTED'].includes(item.status) && !item.supersededAt && <button className="text-button document-delete-action" onClick={() => remove(item)} type="button">Delete</button>}
                  </span>
                </div>
              )) : (
                <div className="empty-register">
                  <span className="empty-register__number">02</span>
                  <h3>{isAdmin ? 'No matching documents.' : 'No documents in this register yet.'}</h3>
                  <p>{isAdmin ? 'Uploaded documents will appear here for review.' : 'Add registration, insurance and driver records above. Only the latest upload is shown unless history is selected.'}</p>
                </div>
              )}
            </div>
            <p className="register-footnote"><span>DOCUMENTS ARE PRIVATE TO THEIR OWNER AND ADMINISTRATORS</span><button className="text-button" onClick={refreshDocuments} type="button">Refresh register</button></p>
          </section>

          <footer className="workspace-footer">
            <span>DRIVEHIRE <span className="footer-slash">/</span> SECURE RECORDS</span>
            <span><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a></span>
          </footer>
        </div>
      </main>
    </div>
  );
}
