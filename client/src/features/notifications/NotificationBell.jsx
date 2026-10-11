import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from './api';

function formatNotificationDate(value) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function NotificationBell() {
  const { token, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await listNotifications(token);
      setItems(result.data);
      setUnreadCount(result.meta?.unreadCount || 0);
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 401) signOut();
      else setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [signOut, token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function markRead(id) {
    try {
      const result = await markNotificationRead(token, id);
      setItems((current) => current.map((item) => item.id === id ? result.data : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead(token);
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  return (
    <div className="notification-menu">
      <button
        aria-expanded={open}
        aria-haspopup="true"
        className="notification-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>Notifications</span>
        <span aria-label={`${unreadCount} unread`} className="notification-count">{unreadCount}</span>
      </button>
      {open && (
        <section aria-label="Notifications" className="notification-panel">
          <div className="notification-panel__heading">
            <div><p className="eyebrow">ACCOUNT ACTIVITY</p><h2>Notifications</h2></div>
            <button className="text-button" disabled={!unreadCount} onClick={markAllRead} type="button">Mark all read</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {loading ? (
            <div aria-label="Loading notifications" className="table-loading"><div className="skeleton-line" /></div>
          ) : items.length ? (
            <ul className="notification-list">
              {items.map((item) => (
                <li className={`notification-item${item.readAt ? '' : ' is-unread'}`} key={item.id}>
                  <div className="notification-item__copy">
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                    <time dateTime={item.createdAt}>{formatNotificationDate(item.createdAt)}</time>
                  </div>
                  {!item.readAt && <button className="text-button" onClick={() => markRead(item.id)} type="button">Mark read</button>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">Your account has no notifications yet.</p>
          )}
          <button className="text-button notification-refresh" onClick={refresh} type="button">Refresh notifications</button>
        </section>
      )}
    </div>
  );
}
