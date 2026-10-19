import { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadStatement, confirmStatement, getGmailStatus, getGmailLabels, getGmailMessages, importGmailAttachment, disconnectGmail, connectGmail, getCards, createCard } from '../services/apiService';
import useStore from '../store/useStore';

const CATEGORIES = ['Food & Dining','Groceries','Travel & Transport','Fuel','Shopping','Entertainment','Utilities & Bills','Healthcare','Education','EMI & Finance','Other'];

function formatINR(n) { return '₹' + (n || 0).toLocaleString('en-IN'); }

function isSuspicious(row) {
  return !row.merchant || row.amount <= 0 || !row.date || row.confidence < 0.8;
}

function resolveCardForStatement(statement, filename, cards) {
  const bank = String(statement?.bank_detected || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!bank || bank === 'unknown') return null;
  let candidates = cards.filter((card) => {
    const cardBank = String(card.bank_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return cardBank.includes(bank) || bank.includes(cardBank);
  });
  const trailingDigits = statement?.card_last_four || String(filename || '').match(/(\d{4})(?=\.pdf$)/i)?.[1];
  if (trailingDigits) {
    const exact = candidates.filter((card) => card.last_four === trailingDigits);
    if (exact.length === 1) return exact[0].id;
    if (exact.length > 1) return null;
    if (candidates.length === 1 && !candidates[0].last_four) return candidates[0].id;
    const product = String(statement?.card_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const productMatches = candidates.filter((card) => String(card.card_name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === product);
    if (productMatches.length === 1 && !productMatches[0].last_four) return productMatches[0].id;
    return null;
  }
  const product = String(statement?.card_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (product) {
    const productMatches = candidates.filter((card) => String(card.card_name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === product);
    if (productMatches.length === 1) return productMatches[0].id;
  }
  return candidates.length === 1 ? candidates[0].id : null;
}

function GmailImporter({ onImport, onImportAll }) {
  const isLocalBrowser = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const [status, setStatus] = useState(null);
  const [labels, setLabels] = useState([]);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [messages, setMessages] = useState([]);
  const [dateFrom, setDateFrom] = useState(() => `${new Date().getFullYear() - 1}-01-01`);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [gmailError, setGmailError] = useState('');
  const [acceptWithoutReview, setAcceptWithoutReview] = useState(false);

  async function refreshStatus() {
    try {
      const result = await getGmailStatus();
      setStatus(result);
      if (result.connected) {
        const availableLabels = await getGmailLabels();
        setLabels(availableLabels);
        setSelectedLabels((current) => current.length ? current.filter((id) => availableLabels.some((label) => label.id === id)) : availableLabels.map((label) => label.id));
      }
    } catch (e) { setGmailError(e.message); }
  }

  useEffect(() => { refreshStatus(); }, []);

  async function searchMessages() {
    if (!selectedLabels.length || !dateFrom || !dateTo) return;
    setLoading(true);
    setGmailError('');
    try {
      const result = await getGmailMessages(selectedLabels, dateFrom, dateTo);
      setMessages(result.messages);
    } catch (e) { setGmailError(e.message); }
    finally { setLoading(false); }
  }

  async function importAttachment(message, attachment) {
    setLoading(true);
    setGmailError('');
    try {
      await onImport({ message_id: message.message_id, attachment_id: attachment.attachment_id, part_id: attachment.part_id, filename: attachment.filename, label_ids: selectedLabels });
    } catch (e) { setGmailError(e.message); }
    finally { setLoading(false); }
  }

  async function importAllAttachments() {
    const items = messages.flatMap((message) => message.attachments
      .filter((attachment) => !attachment.already_imported)
      .map((attachment) => ({
        message_id: message.message_id,
        attachment_id: attachment.attachment_id,
        part_id: attachment.part_id,
        filename: attachment.filename,
        label_ids: selectedLabels,
      })));
    if (!items.length) return;
    setLoading(true);
    setGmailError('');
    try { await onImportAll(items, acceptWithoutReview); }
    catch (e) { setGmailError(e.message || 'Could not import statements.'); }
    finally { setLoading(false); }
  }

  async function disconnect() {
    setLoading(true);
    try {
      await disconnectGmail();
      setMessages([]);
      setLabels([]);
      setSelectedLabels([]);
      await refreshStatus();
    } catch (e) { setGmailError(e.message); }
    finally { setLoading(false); }
  }

  return <section className="card" style={{ marginTop: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div><h2 style={{ fontSize: 18, marginBottom: 4 }}>Import from Gmail</h2><p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Find PDF statements in your Credit Card Statements labels.</p></div>
      {status?.connected && <button className="btn btn-ghost btn-sm" onClick={disconnect} disabled={loading}>Disconnect Gmail</button>}
    </div>
    {gmailError && <div className="readonly-banner" role="alert" style={{ marginTop: 12 }}>{gmailError}</div>}
      {!status ? <p style={{ marginTop: 16, color: 'var(--text-secondary)' }}>Checking Gmail connection…</p> : !status.configured ?
      <div style={{ marginTop: 16, color: 'var(--text-secondary)', fontSize: 13 }}>Gmail import needs Google OAuth credentials configured on the host. See <strong>GMAIL_SETUP.md</strong>.</div> : !status.connected ?
        <div style={{ marginTop: 16 }}><p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>Connect your Google account to browse statement emails. Google grants mailbox read-only access; this importer filters to the selected statement labels. Connect once from the laptop running this app, then use Gmail import here on your iPhone over Tailscale.</p>{isLocalBrowser ? <button className="btn btn-primary" onClick={connectGmail}>Continue with Google</button> : <div className="readonly-banner">On the laptop running the app, open <strong>http://localhost:5174</strong> and connect Gmail there. This keeps the OAuth callback on the same computer.</div>}</div> :
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 8 }}>STATEMENT LABELS</div>
          {labels.length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {labels.map((label) => <label key={label.id} style={{ display: 'flex', gap: 7, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}><input type="checkbox" checked={selectedLabels.includes(label.id)} onChange={(e) => setSelectedLabels((current) => e.target.checked ? [...current, label.id] : current.filter((id) => id !== label.id))} />{label.name}</label>)}
          </div> : <p style={{ marginBottom: 16, color: 'var(--text-muted)' }}>No labels named “Credit Card Statements” or “Credit Card Statments” (or nested under them) were found.</p>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">From</label><input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">To</label><input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
            <button className="btn btn-primary" onClick={searchMessages} disabled={loading || !selectedLabels.length}>{loading ? 'Searching…' : 'Find statements'}</button>
          </div>
          {messages.length > 0 && <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
              <div><span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{messages.reduce((n, message) => n + message.attachments.length, 0)} PDF statement(s) found</span><div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>{acceptWithoutReview ? 'Automatically save parsed transactions. If a bank has multiple cards, you’ll only be asked to identify the card.' : 'Review each statement before saving its transactions.'}</div></div>
              <button className="btn btn-primary btn-sm" disabled={loading || messages.every((message) => message.attachments.every((attachment) => attachment.already_imported))} onClick={importAllAttachments}>{acceptWithoutReview ? 'Auto-accept & import all' : 'Import all new statements'}</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={acceptWithoutReview} onChange={(e) => setAcceptWithoutReview(e.target.checked)} />Accept parsed transactions for all statements automatically (skip transaction review)</label>
            <div className="table-wrapper" style={{ marginTop: 12 }}><table><thead><tr><th>Date</th><th>Email</th><th>Label</th><th>PDF</th></tr></thead><tbody>
              {messages.flatMap((message) => message.attachments.map((attachment) => <tr key={`${message.message_id}-${attachment.attachment_id}`}><td style={{ whiteSpace: 'nowrap' }}>{message.date ? new Date(message.date).toLocaleDateString('en-IN') : '—'}</td><td><div>{message.subject}</div><div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{message.from}</div></td><td>{labels.filter((label) => message.labels.includes(label.id)).map((label) => label.name).join(', ')}</td><td>{attachment.already_imported ? <span style={{ color: 'var(--success)', fontSize: 12 }}>Already processed</span> : <button className="btn btn-ghost btn-sm" disabled={loading} onClick={() => importAttachment(message, attachment)}>{attachment.pending_review ? 'Review again' : 'Import'} {attachment.filename}</button>}</td></tr>))}
            </tbody></table></div>
          </>}
          {!loading && messages.length === 0 && <p style={{ marginTop: 14, color: 'var(--text-muted)', fontSize: 13 }}>Search a date range to find PDF statement attachments.</p>}
        </div>}
  </section>;
}

export default function Upload() {
  const mode = useStore((s) => s.mode);
  const [step, setStep] = useState('upload'); // upload | processing | review | done
  const [fileQueue, setFileQueue] = useState([]);
  const [gmailQueue, setGmailQueue] = useState([]);
  const [currentFileName, setCurrentFileName] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [reviewRows, setReviewRows] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cards, setCards] = useState([]);
  const [reviewCardId, setReviewCardId] = useState('');
  const [autoAcceptCardPrompt, setAutoAcceptCardPrompt] = useState(false);
  const [acceptGmailBatch, setAcceptGmailBatch] = useState(false);
  const [savedStatements, setSavedStatements] = useState(0);
  const [showQuickCard, setShowQuickCard] = useState(false);
  const [cardDraft, setCardDraft] = useState({ bank_name: '', card_name: '', last_four: '' });

  useEffect(() => { if (mode === 'live') getCards().then(setCards).catch((e) => setError(e.message)); }, [mode]);

  async function addReviewCard(e) {
    e.preventDefault();
    try {
      const card = await createCard({ ...cardDraft, last_four: cardDraft.last_four || null });
      setCards((current) => current.some((item) => item.id === card.id) ? current : [...current, card]);
      setReviewCardId(String(card.id));
      setCardDraft({ bank_name: '', card_name: '', last_four: '' });
      setShowQuickCard(false);
      setError('');
    } catch (e) { setError(e.message || 'Could not add card.'); }
  }

  const processFile = async (file) => {
    setError('');
    setStep('processing');
    setCurrentFileName(file.name);
    try {
      const result = await uploadStatement(file);
      setParseResult(result);
      setReviewCardId(String(resolveCardForStatement(result, file.name, cards) || ''));
      setAutoAcceptCardPrompt(false);
      setReviewRows(result.transactions.map((t, i) => ({ ...t, _id: i })));
      setStep('review');
    } catch (e) {
      setError(`Error in ${file.name}: ` + e.message);
      setStep('upload');
    }
  };

  const processGmailAttachment = async (attachment, remaining = [], autoAccept = false) => {
    setError('');
    setGmailQueue(remaining);
    setStep('processing');
    setCurrentFileName(attachment.filename);
    try {
      const result = await importGmailAttachment(attachment);
      if (result.already_processed) {
        if (remaining.length) {
          const [next, ...rest] = remaining;
          return await processGmailAttachment(next, rest, autoAccept);
        }
        setError(`${attachment.filename}: ${result.message}`);
        setStep('upload');
        return;
      }
      setParseResult(result);
      setReviewRows(result.transactions.map((t, i) => ({ ...t, _id: i })));
      setAutoAcceptCardPrompt(false);
      if (autoAccept) {
        const detectedCardId = resolveCardForStatement(result, attachment.filename, cards);
        if (detectedCardId) {
          await confirmStatement(result.statement_id, result.transactions.filter((row) => !row.is_duplicate), detectedCardId);
          setSavedStatements((count) => count + 1);
          if (remaining.length) {
            const [next, ...rest] = remaining;
            return await processGmailAttachment(next, rest, true);
          }
          setStep('done');
          return;
        }
        setAutoAcceptCardPrompt(true);
      }
      setReviewCardId(String(resolveCardForStatement(result, attachment.filename, cards) || ''));
      setStep('review');
    } catch (e) {
      setError(`Error importing ${attachment.filename}: ${e.message}`);
      setStep('upload');
      throw e;
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
      await confirmStatement(parseResult.statement_id, validRows, reviewCardId);
      setSavedStatements((count) => count + 1);
      
      if (fileQueue.length > 0) {
        const nextFile = fileQueue[0];
        setFileQueue((prev) => prev.slice(1));
        await processFile(nextFile);
      } else if (gmailQueue.length > 0) {
        const [nextAttachment, ...remaining] = gmailQueue;
        setGmailQueue(remaining);
        await processGmailAttachment(nextAttachment, remaining, acceptGmailBatch);
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
            {savedStatements > 1 ? `${savedStatements} statements have been saved to your database.` : `${reviewRows.length} transactions have been saved to your database.`}
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
    const queuedCount = fileQueue.length + gmailQueue.length;
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
              {queuedCount > 0 && <span style={{ color: 'var(--accent-light)', marginLeft: 8 }}>• {queuedCount} statements remaining</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setStep('upload')}>← Back</button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={saving || !reviewCardId}>
              {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /></> : autoAcceptCardPrompt ? '✅ Accept & continue' : '✅ Save All to Database'}
            </button>
          </div>
        </div>

        <section className="chart-card" style={{ marginBottom: 16, padding: 18 }}>
          <label htmlFor="review-card" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>WHICH CARD IS THIS STATEMENT FOR?</label>
          {(parseResult.card_name || parseResult.card_last_four) && <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>Detected from statement: <strong>{parseResult.bank_detected}{parseResult.card_name ? ` · ${parseResult.card_name}` : ''}{parseResult.card_last_four ? ` · ••${parseResult.card_last_four}` : ''}</strong></div>}
          {cards.length ? <select id="review-card" className="form-select" style={{ maxWidth: 420 }} value={reviewCardId} onChange={(e) => setReviewCardId(e.target.value)}>
            <option value="">Select a card to continue…</option>
            {cards.map((card) => <option key={card.id} value={card.id}>{card.bank_name} · {card.display_name}</option>)}
          </select> : <div style={{ color: 'var(--warning)', fontSize: 13 }}>Add a card below or manage your card list in Settings.</div>}
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => { const opening = !showQuickCard; setShowQuickCard(opening); if (opening) setCardDraft({ bank_name: parseResult.bank_detected === 'HDFC' ? 'HDFC Bank' : parseResult.bank_detected === 'ICICI' ? 'ICICI Bank' : parseResult.bank_detected || '', card_name: parseResult.card_name || '', last_four: parseResult.card_last_four || '' }); }}>{showQuickCard ? 'Cancel' : '+ Add a card'}</button>
          {showQuickCard && <form onSubmit={addReviewCard} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 10 }}>
            <input className="form-input" required placeholder="Bank (e.g. HDFC)" aria-label="Bank name" value={cardDraft.bank_name} onChange={(e) => setCardDraft({ ...cardDraft, bank_name: e.target.value })} style={{ maxWidth: 170 }} />
            <input className="form-input" required placeholder="Card name" aria-label="Card name" value={cardDraft.card_name} onChange={(e) => setCardDraft({ ...cardDraft, card_name: e.target.value })} style={{ maxWidth: 220 }} />
            <input className="form-input" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" placeholder="Last 4 (optional)" aria-label="Last four digits" value={cardDraft.last_four} onChange={(e) => setCardDraft({ ...cardDraft, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })} style={{ maxWidth: 145 }} />
            <button type="submit" className="btn btn-primary btn-sm">Save card</button>
          </form>}
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>All transactions in this statement will be linked to this card.</div>
        </section>

        {error && <div className="toast error" style={{ position: 'relative', bottom: 'auto', right: 'auto', marginBottom: 16 }}>{error}</div>}

        {autoAcceptCardPrompt && <div className="readonly-banner" style={{ marginBottom: 16 }}>Automatic acceptance is on. The transactions are parsed and will be saved without row-by-row review once you identify the card for this statement.</div>}

        {parseResult.parse_errors?.length > 0 && (
          <div className="readonly-banner" style={{ marginBottom: 16 }}>
            ⚠️ Parser warnings: {parseResult.parse_errors.join('; ')}
          </div>
        )}

        {!autoAcceptCardPrompt && <div className="table-wrapper" style={{ marginBottom: 16 }}>
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
        </div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={saving || !reviewCardId}>
            {saving ? 'Saving...' : autoAcceptCardPrompt ? `✅ Accept & Continue (${queuedCount} left)` : `✅ Save & Continue (${queuedCount} left)`}
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

      <GmailImporter onImport={processGmailAttachment} onImportAll={(items, autoAccept) => {
        setSavedStatements(0);
        setAcceptGmailBatch(autoAccept);
        return processGmailAttachment(items[0], items.slice(1), autoAccept);
      }} />

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
