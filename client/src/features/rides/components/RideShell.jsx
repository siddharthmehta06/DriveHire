import { WorkspaceSidebar } from "../../../components/WorkspaceSidebar";
import { NotificationBell } from "../../notifications/NotificationBell";

export function RideShell({ user, signOut, children }) {
  return (
    <div className="workspace">
      <WorkspaceSidebar signOut={signOut} user={user} />
      <main className="workspace-main">
        <header className="workspace-topbar">
          <p>
            DRIVEHIRE <span>/</span> CARPOOL
          </p>
          <div className="workspace-topbar__actions">
            <NotificationBell />
            <span>
              {user.role === "DRIVER"
                ? "Driver workspace"
                : "Passenger workspace"}
            </span>
          </div>
        </header>
        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}
