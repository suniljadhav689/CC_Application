import { useEffect, useState, useRef } from 'react';
import { getTransactions, updateTransaction, bulkUpdateTransactions, deleteTransaction } from '../services/apiService';
import useStore from '../store/useStore';

const CATEGORIES = ['Food & Dining','Groceries','Travel & Transport','Fuel','Shopping','Entertainment','Utilities & Bills','Healthcare','Education','EMI & Finance','Other'];

function formatINR(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

function TransactionModal({ txn, onClose, onSave, onDelete }) {
  const [draft, setDraft] = useState({
    merchant_corrected: txn.merchant_corrected || txn.merchant || '',
    category_corrected: txn.category_corrected || txn.category || 'Other',
    notes: txn.notes || '',
    personal_share: txn.personal_share ?? txn.amount,
    friends_share: txn.friends_share ?? 0,
    is_fraud: txn.is_fraud,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDebit = txn.transaction_type === 'debit';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ width: 500, padding: 32, background: 'var(--bg-card)', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
        <h2 style={{ marginTop: 0, marginBottom: 8, fontSize: 22 }}>Transaction Details</h2>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>{formatDate(txn.date)} • {isDebit ? 'Debit' : 'Credit'}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>MERCHANT</label>
            <input className="form-input" value={draft.merchant_corrected} onChange={e => setDraft({ ...draft, merchant_corrected: e.target.value })} />
            {txn.merchant_corrected && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Original: {txn.merchant}</div>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>CATEGORY</label>
            <select className="form-select" value={draft.category_corrected} onChange={e => setDraft({ ...draft, category_corrected: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>TOTAL AMOUNT</label>
          <div style={{ fontSize: 24, fontWeight: 700, color: isDebit ? 'var(--danger)' : 'var(--success)' }}>
            {formatINR(txn.amount)}
          </div>
        </div>

        {isDebit && (
          <div style={{ background: 'var(--bg-body)', padding: 16, borderRadius: 12, marginBottom: 24, border: '1px solid rgba(255,255,255,0.05)' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>SPLIT BILL (FRIENDS SHARE)</label>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>My Share</div>
                <input type="number" className="form-input" style={{ fontWeight: 600 }} value={draft.personal_share} onChange={e => {
                  const val = Math.max(0, Math.min(txn.amount, parseFloat(e.target.value) || 0));
                  setDraft({ ...draft, personal_share: val, friends_share: txn.amount - val });
                }} />
              </div>
              <div style={{ fontSize: 24, color: 'var(--text-muted)' }}>+</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Friends Share</div>
                <input type="number" className="form-input" style={{ fontWeight: 600, color: 'var(--friends)' }} value={draft.friends_share} onChange={e => {
                  const val = Math.max(0, Math.min(txn.amount, parseFloat(e.target.value) || 0));
                  setDraft({ ...draft, friends_share: val, personal_share: txn.amount - val });
                }} />
              </div>
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>NOTES</label>
          <input className="form-input" placeholder="Add a note..." value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <button className={`btn btn-sm ${draft.is_fraud ? 'btn-danger' : 'btn-ghost'}`} onClick={() => setDraft({ ...draft, is_fraud: !draft.is_fraud })}>
            🚨 {draft.is_fraud ? 'Marked as Fraud' : 'Flag as Fraud'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 20 }}>
          <button className={`btn ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`} onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 3000);
            } else {
              onDelete(txn.id);
            }
          }}>
            {confirmDelete ? 'Sure? Click again' : '🗑️ Delete'}
          </button>
          
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={() => onSave(txn.id, draft)}>Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ txn, mode, selected, onSelect, onClick }) {
  const merchant = txn.merchant_corrected || txn.merchant || 'Unknown';
  const category = txn.category_corrected || txn.category || 'Other';
  const isDebit = txn.transaction_type === 'debit';
  const hasSplit = txn.friends_share > 0;

  return (
    <tr style={{ opacity: txn.is_excluded ? 0.4 : 1, cursor: mode === 'live' ? 'pointer' : 'default' }} onClick={() => { if(mode === 'live') onClick(txn); }}>
      <td onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(txn.id, e.target.checked)}
          style={{ accentColor: 'var(--accent)' }} />
      </td>
      <td style={{ color: 'var(--text-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(txn.date)}</td>
      <td>
        <div style={{ fontWeight: 500 }}>{merchant}</div>
        {txn.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>📝 {txn.notes}</div>}
      </td>
      <td>
        <span className="badge badge-category">{category}</span>
      </td>
      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: isDebit ? 'var(--danger)' : 'var(--success)' }}>
        {isDebit ? '-' : '+'}{formatINR(txn.amount)}
        {hasSplit && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 4 }}>
            (Me: {formatINR(txn.personal_share)})
          </div>
        )}
      </td>
      <td style={{ textAlign: 'center', opacity: txn.is_fraud ? 1 : 0.2 }}>
        {txn.is_fraud ? '🚨' : '—'}
      </td>
      <td style={{ textAlign: 'center', opacity: hasSplit ? 1 : 0.2 }}>
        {hasSplit ? '👫' : '—'}
      </td>
      <td>
        {mode === 'live' && <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); onClick(txn); }}>Open</button>}
      </td>
    </tr>
  );
}

export default function Transactions() {
  const mode = useStore((s) => s.mode);
  const [txns, setTxns] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', category: '', is_fraud: '', is_friends: '', date_from: '', date_to: '' });
  const [selected, setSelected] = useState(new Set());
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState('');
  const [editingTxn, setEditingTxn] = useState(null); // The txn opened in modal
  const PAGE_SIZE = 50;

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function loadData() {
    if (mode === 'checking') return;
    setLoading(true);
    try {
      const params = { ...filters, skip: page * PAGE_SIZE, limit: PAGE_SIZE };
      if (!params.category) delete params.category;
      if (params.is_fraud === '') delete params.is_fraud;
      if (params.is_friends === '') delete params.is_friends;
      const res = await getTransactions(params);
      setTxns(res.transactions);
      setTotal(res.total);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [mode, filters, page]);

  async function handleUpdate(id, data) {
    try {
      const updated = await updateTransaction(id, data);
      setTxns((prev) => prev.map((t) => t.id === id ? updated : t));
      setEditingTxn(null);
      showToast('✅ Transaction updated');
    } catch (e) {
      showToast('❌ Update failed: ' + e.message);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteTransaction(id);
      setTxns((prev) => prev.filter((t) => t.id !== id));
      setTotal((t) => t - 1);
      setEditingTxn(null);
      showToast('✅ Transaction deleted');
    } catch (e) {
      showToast('❌ Delete failed: ' + e.message);
    }
  }

  function handleSelect(id, checked) {
    setSelected((prev) => {
      const s = new Set(prev);
      checked ? s.add(id) : s.delete(id);
      return s;
    });
  }

  function selectAll() {
    if (selected.size === txns.length) setSelected(new Set());
    else setSelected(new Set(txns.map((t) => t.id)));
  }

  async function bulkFlag(field) {
    if (!selected.size || mode !== 'live') return;
    try {
      const ids = [...selected];
      await bulkUpdateTransactions(ids, { [field]: true });
      setTxns((prev) => prev.map((t) => selected.has(t.id) ? { ...t, [field]: true } : t));
      setSelected(new Set());
      showToast(`✅ ${ids.length} transactions updated`);
    } catch (e) {
      showToast('❌ ' + e.message);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {toast && <div className={`toast ${toast.startsWith('❌') ? 'error' : 'success'}`}>{toast}</div>}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="page-subtitle">{total} total transactions</p>
        </div>
        {selected.size > 0 && mode === 'live' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{selected.size} selected</span>
            <button className="btn btn-danger btn-sm" onClick={() => bulkFlag('is_fraud')}>🚨 Mark Fraud</button>
            <button className="btn btn-sm" onClick={() => bulkFlag('is_friends')} style={{ background: 'var(--purple-glow)', color: 'var(--friends)', border: '1px solid rgba(168,85,247,0.3)' }}>👫 Mark Friends</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
      </div>

      {mode === 'readonly' && <div className="readonly-banner">⚠️ Read-only mode — editing is disabled while backend is offline.</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <input className="form-input" placeholder="🔍 Search merchant..." style={{ maxWidth: 240 }}
          value={filters.search} onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(0); }} />
        <select className="form-select" style={{ maxWidth: 180 }}
          value={filters.category} onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(0); }}>
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 140 }}
          value={filters.is_fraud} onChange={(e) => { setFilters({ ...filters, is_fraud: e.target.value }); setPage(0); }}>
          <option value="">All</option>
          <option value="true">🚨 Fraud</option>
          <option value="false">Not Fraud</option>
        </select>
        <select className="form-select" style={{ maxWidth: 160 }}
          value={filters.is_friends} onChange={(e) => { setFilters({ ...filters, is_friends: e.target.value }); setPage(0); }}>
          <option value="">All</option>
          <option value="true">👫 Friends</option>
          <option value="false">Personal</option>
        </select>
        <input type="date" className="form-input" style={{ maxWidth: 160 }}
          value={filters.date_from} onChange={(e) => { setFilters({ ...filters, date_from: e.target.value }); setPage(0); }} />
        <input type="date" className="form-input" style={{ maxWidth: 160 }}
          value={filters.date_to} onChange={(e) => { setFilters({ ...filters, date_to: e.target.value }); setPage(0); }} />
        <button className="btn btn-ghost btn-sm" onClick={() => { setFilters({ search: '', category: '', is_fraud: '', is_friends: '', date_from: '', date_to: '' }); setPage(0); }}>Reset</button>
      </div>

      {loading ? (
        <div className="loading-screen"><div className="spinner" /><span>Loading...</span></div>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" checked={selected.size === txns.length && txns.length > 0} onChange={selectAll} style={{ accentColor: 'var(--accent)' }} /></th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'center' }}>🚨</th>
                  <th style={{ textAlign: 'center' }}>👫</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {txns.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>No transactions found</td></tr>
                ) : txns.map((t) => (
                  <TransactionRow key={t.id} txn={t} mode={mode}
                    selected={selected.has(t.id)} onSelect={handleSelect} onClick={setEditingTxn} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, alignItems: 'center' }}>
              <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Page {page + 1} of {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {editingTxn && (
        <TransactionModal 
          txn={editingTxn} 
          onClose={() => setEditingTxn(null)} 
          onSave={handleUpdate} 
          onDelete={handleDelete} 
        />
      )}
    </div>
  );
}
