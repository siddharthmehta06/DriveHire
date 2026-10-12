import { BrandMark } from '../../../components/BrandMark';
import { NotificationBell } from '../../notifications/NotificationBell';

export function RideShell({ user, signOut, children }) {
  const isDriver = user.role === 'DRIVER';
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <BrandMark compact />
        <div className="sidebar-rule" />
        <p className="sidebar-label">CARPOOL</p>
        <nav aria-label="Main navigation" className="sidebar-nav">
          <a className="sidebar-nav__link" href="/"><span className="nav-index">01</span><span>Vehicle register</span></a>
          <a className="sidebar-nav__link" href="/rides/search"><span className="nav-index">02</span><span>Search rides</span></a>
          <a className="sidebar-nav__link" href="/bookings"><span className="nav-index">03</span><span>My bookings</span></a>
          {isDriver && <a className="sidebar-nav__link" href="/rides/post"><span className="nav-index">04</span><span>Post a ride</span></a>}
          {isDriver && <a className="sidebar-nav__link" href="/rides/mine"><span className="nav-index">05</span><span>My rides</span></a>}
          {isDriver && <a className="sidebar-nav__link" href="/driver/requests"><span className="nav-index">06</span><span>Ride requests</span></a>}
          <a className="sidebar-nav__link" href="/documents"><span className="nav-index">07</span><span>Documents</span></a>
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note__index">DH / ROUTES</span>
          <p>Ride schedules and seats update from the live service.</p>
          <span className="sidebar-note__line" />
        </div>
        <div className="sidebar-user">
          <span className="user-monogram">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>
          <span className="sidebar-user__identity"><strong>{user.name}</strong><small>{isDriver ? 'driver' : 'passenger'}</small></span>
          <button className="signout-button" onClick={signOut} type="button">Sign out</button>
        </div>
      </aside>
      <main className="workspace-main">
        <header className="workspace-topbar">
          <p>DRIVEHIRE <span>/</span> CARPOOL</p>
          <div className="workspace-topbar__actions"><NotificationBell /><span>{user.role === 'DRIVER' ? 'Driver workspace' : 'Passenger workspace'}</span></div>
        </header>
        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}
