import { useState } from 'react';
import { downloadSQLite, downloadCSV, downloadExcel } from '../services/apiService';
import useStore from '../store/useStore';

export default function Settings() {
  const mode = useStore((s) => s.mode);
  const [backendIp, setBackendIp] = useState(localStorage.getItem('backend_ip') || '192.168.1.1');
  const [backendPort, setBackendPort] = useState(localStorage.getItem('backend_port') || '8000');
  const [saved, setSaved] = useState(false);

  function saveBackend() {
    localStorage.setItem('backend_ip', backendIp);
    localStorage.setItem('backend_port', backendPort);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      window.location.reload(); // Reload to apply new IP
    }, 1200);
  }

  const CATEGORIES = ['Food & Dining','Groceries','Travel & Transport','Fuel','Shopping','Entertainment','Utilities & Bills','Healthcare','Education','EMI & Finance','Other'];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your backend connection, cards, and data exports</p>
      </div>

      {/* Backend Connection */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>📡 Backend Connection</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Enter your Windows PC's local IP address. Go to your PC → PowerShell → type <code style={{ background: 'var(--bg-input)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>ipconfig</code> → look for "IPv4 Address".
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            <label className="form-label">PC IP Address</label>
            <input className="form-input" value={backendIp} onChange={(e) => setBackendIp(e.target.value)} placeholder="e.g. 192.168.1.1" />
          </div>
          <div className="form-group" style={{ width: 100, marginBottom: 0 }}>
            <label className="form-label">Port</label>
            <input className="form-input" value={backendPort} onChange={(e) => setBackendPort(e.target.value)} placeholder="8000" />
          </div>
          <button className="btn btn-primary" onClick={saveBackend} style={{ marginBottom: 0 }}>
            {saved ? '✅ Saved!' : 'Save & Reconnect'}
          </button>
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className={`mode-badge ${mode}`} style={{ marginTop: 0, display: 'inline-flex' }}>
            <div className="mode-dot" />
            {mode === 'live' ? '🟢 Backend connected' : mode === 'readonly' ? '🟡 Backend offline' : '⏳ Checking...'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Current: http://{backendIp}:{backendPort}</div>
        </div>
      </div>

      {/* Backup & Export */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>💾 Backup & Export</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Download your data as SQLite (for DBeaver), CSV, or Excel.
          {mode !== 'live' && <span style={{ color: 'var(--warning)' }}> (Requires live connection)</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" disabled={mode !== 'live'} onClick={downloadSQLite}>
            🗄️ Download SQLite (.db)
          </button>
          <button className="btn btn-ghost" disabled={mode !== 'live'} onClick={downloadCSV}>
            📊 Export CSV
          </button>
          <button className="btn btn-ghost" disabled={mode !== 'live'} onClick={downloadExcel}>
            📗 Export Excel
          </button>
        </div>
      </div>

      {/* Categories Reference */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🏷️ Categories</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Auto-categorization rules are applied when parsing. You can always override categories on any transaction.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CATEGORIES.map((c) => (
            <span key={c} className="badge badge-category" style={{ fontSize: 13, padding: '5px 12px' }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Instructions */}
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>📱 Add to iPhone Home Screen</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            ['1', 'Open this app in <strong>Safari</strong> on your iPhone'],
            ['2', 'Tap the <strong>Share button</strong> (box with arrow at bottom)'],
            ['3', 'Tap <strong>"Add to Home Screen"</strong>'],
            ['4', 'Tap <strong>Add</strong> — it\'s now on your home screen!'],
          ].map(([n, text]) => (
            <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent-glow)', color: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{n}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', paddingTop: 3 }} dangerouslySetInnerHTML={{ __html: text }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
