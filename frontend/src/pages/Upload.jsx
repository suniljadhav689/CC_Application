import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadStatement, confirmStatement } from '../services/apiService';
import useStore from '../store/useStore';

const CATEGORIES = ['Food & Dining','Groceries','Travel & Transport','Fuel','Shopping','Entertainment','Utilities & Bills','Healthcare','Education','EMI & Finance','Other'];

function formatINR(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }

function isSuspicious(row) {
  return !row.merchant || row.amount <= 0 || !row.date || row.confidence < 0.8;
}

export default function Upload() {
  const mode = useStore((s) => s.mode);
  const [step, setStep] = useState('upload'); // upload | processing | review | done
  const [fileQueue, setFileQueue] = useState([]);
  const [currentFileName, setCurrentFileName] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [reviewRows, setReviewRows] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const processFile = async (file) => {
    setError('');
    setStep('processing');
    setCurrentFileName(file.name);
    try {
      const result = await uploadStatement(file);
      setParseResult(result);
      setReviewRows(result.transactions.map((t, i) => ({ ...t, _id: i })));
      setStep('review');
    } catch (e) {
      setError(`Error in ${file.name}: ` + e.message);
      setStep('upload');
    }
  };

  const onDrop = useCallback((files) => {
    if (!files || files.length === 0) return;
    const [first, ...rest] = files;
    setFileQueue(rest);
    processFile(first);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: mode !== 'live',
  });

  function updateRow(idx, field, value) {
    setReviewRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function removeRow(idx) {
    setReviewRows((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleConfirm() {
    setSaving(true);
    setError('');
    try {
      const validRows = reviewRows.filter(r => !r.is_duplicate);
      await confirmStatement(parseResult.statement_id, validRows);
      
      if (fileQueue.length > 0) {
        const nextFile = fileQueue[0];
        setFileQueue((prev) => prev.slice(1));
        await processFile(nextFile);
      } else {
        setStep('done');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (mode !== 'live') {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Upload Statement</h1>
        </div>
        <div className="readonly-banner">⚠️ Upload is only available when connected to your home PC backend.</div>
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Connect to Home Wi-Fi to Upload</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8 }}>Statement processing requires your PC backend to be live.</div>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Upload Statement</h1>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', marginBottom: 8 }}>Statement Saved!</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24 }}>
            {reviewRows.length} transactions have been saved to your database.
          </div>
          <button className="btn btn-primary" onClick={() => { setStep('upload'); setParseResult(null); setReviewRows([]); }}>
            📤 Upload Another
          </button>
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Upload Statement</h1></div>
        <div className="card" style={{ textAlign: 'center', padding: 80 }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 20px', borderWidth: 3 }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Analyzing {currentFileName}...</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Detecting bank, extracting transactions, auto-categorizing...</div>
        </div>
      </div>
    );
  }

  if (step === 'review' && parseResult) {
    const suspicious = reviewRows.filter(isSuspicious);
    return (
      <div>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title">⚠️ Review {currentFileName}</h1>
            <p className="page-subtitle">
              Detected <strong style={{ color: 'var(--accent-light)' }}>{parseResult.bank_detected}</strong> •
              {reviewRows.length} transactions found
              {reviewRows.filter(r => r.is_duplicate).length > 0 && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>• {reviewRows.filter(r => r.is_duplicate).length} duplicates skipped</span>}
              {suspicious.length > 0 && <span style={{ color: 'var(--warning)', marginLeft: 8 }}>• {suspicious.length} rows need attention</span>}
              {fileQueue.length > 0 && <span style={{ color: 'var(--accent-light)', marginLeft: 8 }}>• {fileQueue.length} files remaining</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setStep('upload')}>← Back</button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /></> : '✅ Save All to Database'}
            </button>
          </div>
        </div>

        {error && <div className="toast error" style={{ position: 'relative', bottom: 'auto', right: 'auto', marginBottom: 16 }}>{error}</div>}

        {parseResult.parse_errors?.length > 0 && (
          <div className="readonly-banner" style={{ marginBottom: 16 }}>
            ⚠️ Parser warnings: {parseResult.parse_errors.join('; ')}
          </div>
        )}

        <div className="table-wrapper" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Date</th>
                <th>Merchant</th>
                <th>Amount (₹)</th>
                <th>Type</th>
                <th>Category</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reviewRows.map((row, idx) => (
                <tr key={row._id} className={`review-row${isSuspicious(row) && !row.is_duplicate ? ' suspicious' : ''}`} style={row.is_duplicate ? { opacity: 0.5, pointerEvents: 'none', filter: 'grayscale(1)' } : {}}>
                  <td style={{ textAlign: 'center' }}>
                    {row.is_duplicate ? <span title="Duplicate transaction, will be skipped" style={{ fontSize: 16 }}>⏭️</span> : (isSuspicious(row) ? '⚠️' : '✓')}
                  </td>
                  <td>
                    <input type="date" className="inline-input" value={row.date || ''}
                      onChange={(e) => updateRow(idx, 'date', e.target.value)} />
                  </td>
                  <td>
                    <input className="inline-input" value={row.merchant_corrected ?? row.merchant ?? ''}
                      placeholder="Merchant name"
                      onChange={(e) => updateRow(idx, 'merchant_corrected', e.target.value)} />
                  </td>
                  <td>
                    <input type="number" className="inline-input" value={row.amount ?? ''}
                      style={{ width: 100 }}
                      onChange={(e) => updateRow(idx, 'amount', parseFloat(e.target.value))} />
                  </td>
                  <td>
                    <select className="inline-input" value={row.transaction_type || 'debit'}
                      onChange={(e) => updateRow(idx, 'transaction_type', e.target.value)}>
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                  </td>
                  <td>
                    <select className="inline-input" value={row.category_corrected ?? row.category ?? 'Other'}
                      onChange={(e) => updateRow(idx, 'category_corrected', e.target.value)}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-icon" title="Remove row"
                      onClick={() => removeRow(idx)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: 16 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving...' : `✅ Save & Continue (${fileQueue.length} left)`}
          </button>
        </div>
      </div>
    );
  }

  // Upload step
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Upload Statement</h1>
        <p className="page-subtitle">Upload a PDF credit card statement — we'll auto-detect your bank and extract all transactions</p>
      </div>

      {error && <div className="toast error" style={{ position: 'relative', bottom: 'auto', right: 'auto', marginBottom: 16 }}>{error}</div>}

      <div {...getRootProps()} className={`drop-zone${isDragActive ? ' dragging' : ''}`}>
        <input {...getInputProps()} />
        <div className="drop-zone-icon">📄</div>
        <div className="drop-zone-title">
          {isDragActive ? 'Drop them here!' : 'Drop your PDF statements here'}
        </div>
        <div className="drop-zone-sub">or click to browse • You can upload multiple PDFs at once</div>
        <div style={{ marginTop: 24 }}>
          <button className="btn btn-primary" type="button">📤 Choose PDF File</button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>HOW IT WORKS</div>
        {[
          ['📤', 'Upload', 'Drop your unlocked PDF statement'],
          ['🔍', 'Auto-Detect', 'Bank is detected and parsed automatically'],
          ['⚠️', 'Review', 'Check extracted transactions before saving'],
          ['✅', 'Save', 'Clean data goes into your database'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
