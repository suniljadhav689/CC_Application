import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom';
import './index.css';
import { startConnectionMonitor } from './services/connectionManager';
import useStore from './store/useStore';

import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Upload from './pages/Upload';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '📊', exact: true },
  { to: '/transactions', label: 'Transactions', icon: '💳' },
  { to: '/upload', label: 'Upload', icon: '📤' },
  { to: '/analytics', label: 'Analytics', icon: '📈' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

function Sidebar() {
  const mode = useStore((s) => s.mode);
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);

  const modeLabel = mode === 'live' ? '🟢 Backend Live' : mode === 'readonly' ? '🟡 Read-Only' : '⏳ Checking...';
  const syncText = lastSyncedAt
    ? `Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : 'Not yet synced';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">💳</div>
        <div>
          <div className="sidebar-logo-text">Card Analyzer</div>
          <div className="sidebar-logo-sub">Spend Tracker</div>
        </div>
      </div>

      <div className="sidebar-section-label">Navigation</div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.exact}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}

      <div className={`mode-badge ${mode}`} style={{ marginTop: 'auto' }}>
        <div className="mode-dot" />
        <div>
          <div>{modeLabel}</div>
          {mode === 'readonly' && <div style={{ fontSize: 10, opacity: 0.7 }}>{syncText}</div>}
        </div>
      </div>
    </aside>
  );
}

function BottomNav() {
  const location = useLocation();

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink key={item.to} to={item.to} end={item.exact}>
              <div className={`bottom-nav-item${isActive ? ' active' : ''}`}>
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </div>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

function AppLayout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    startConnectionMonitor();
  }, []);

  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
