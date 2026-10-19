import { useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { getCardMonthlySpend, getCards, getTransactions } from '../services/apiService';
import useStore from '../store/useStore';
import './CardInsights.css';

const PALETTE = ['#8b83ff', '#36cfc9', '#ff9f68', '#f472b6', '#a3e635', '#60a5fa', '#fbbf24', '#c084fc'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const money = (value) => `₹${INR.format(value || 0)}`;
const dateText = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—';

function getRange(year, length) {
  const start = year - length + 1;
  return { startYear: start, endYear: year, from: `${start}-01-01`, to: `${year}-12-31` };
}

function CardTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((item) => Number.isFinite(item.value));
  return <div className="ci-tooltip"><strong>{label}</strong>{rows.map((row) => <div key={row.dataKey} style={{ color: row.color }}><span>{row.name}</span><b>{money(row.value)}</b></div>)}</div>;
}

function Metric({ label, value, note, icon }) {
  return <article className="ci-metric"><div className="ci-metric-top"><span>{label}</span><span className="ci-metric-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></article>;
}

function cardLabel(card) {
  return `${card.bank_name ? `${card.bank_name} · ` : ''}${card.card_name || card.display_name}${card.last_four ? ` ••${card.last_four}` : ''}`;
}

export default function CardInsights() {
  const mode = useStore((state) => state.mode);
  const currentYear = new Date().getFullYear();
  const [view, setView] = useState('overview');
  const [year, setYear] = useState(currentYear);
  const [yearRange, setYearRange] = useState(3);
  const [metric, setMetric] = useState('raw_total');
  const [cards, setCards] = useState([]);
  const [rows, setRows] = useState([]);
  const [selectedCard, setSelectedCard] = useState('all');
  const [visibleCards, setVisibleCards] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const range = useMemo(() => getRange(year, yearRange), [year, yearRange]);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([getCards(), getCardMonthlySpend(range.startYear, range.endYear)])
      .then(([cardList, monthly]) => {
        if (!active) return;
        setCards(cardList);
        setRows(monthly);
        setSelectedCard((previous) => previous === 'all' || cardList.some((card) => String(card.id) === previous) ? previous : String(cardList[0]?.id ?? 'all'));
      })
      .catch((err) => { if (active) setError(err.message || 'Could not load card spending.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, range]);

  const monthData = useMemo(() => {
    const values = new Map();
    for (let yearValue = range.startYear; yearValue <= range.endYear; yearValue += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${yearValue}-${String(month).padStart(2, '0')}`;
        values.set(key, { key, label: `${MONTHS[month - 1]} '${String(yearValue).slice(-2)}`, year: yearValue, month, total: 0, raw_total: 0, count: 0 });
      }
    }
    rows.forEach((row) => {
      const value = values.get(row.month_key);
      if (!value) return;
      value.total += row.total;
      value.raw_total += row.raw_total;
      value.count += row.count;
      value[`card-${row.card_id ?? 'unknown'}`] = row[metric];
    });
    values.forEach((value) => { cards.forEach((card) => { value[`card-${card.id}`] ??= 0; }); });
    return [...values.values()];
  }, [cards, metric, range, rows]);

  const cardTotals = useMemo(() => {
    const result = cards.map((card) => {
      const cardRows = rows.filter((row) => row.card_id === card.id);
      return { ...card, label: cardLabel(card), total: cardRows.reduce((sum, row) => sum + row.total, 0), raw_total: cardRows.reduce((sum, row) => sum + row.raw_total, 0), count: cardRows.reduce((sum, row) => sum + row.count, 0), activeMonths: cardRows.length };
    });
    const unassigned = rows.filter((row) => row.card_id == null);
    if (unassigned.length) result.push({ id: null, bank_name: '', card_name: 'Unassigned', label: 'Unassigned card', total: unassigned.reduce((sum, row) => sum + row.total, 0), raw_total: unassigned.reduce((sum, row) => sum + row.raw_total, 0), count: unassigned.reduce((sum, row) => sum + row.count, 0), activeMonths: unassigned.length });
    return result;
  }, [cards, rows]);

  const visibleKeys = visibleCards ?? cardTotals.map((card) => `card-${card.id ?? 'unknown'}`);
  const selectedCardRows = selectedCard === 'all' ? rows : rows.filter((row) => selectedCard === 'unknown' ? row.card_id == null : String(row.card_id) === selectedCard);
  const selectedSeries = monthData.map((month) => {
    if (selectedCard === 'all') return month;
    const row = rows.find((item) => (selectedCard === 'unknown' ? item.card_id == null : item.card_id === Number(selectedCard)) && item.month_key === month.key);
    return { ...month, total: row?.total ?? 0, raw_total: row?.raw_total ?? 0, count: row?.count ?? 0 };
  });
  const selectedTotal = selectedCard === 'all'
    ? selectedCardRows.reduce((sum, row) => sum + row[metric], 0)
    : selectedCardRows.reduce((sum, row) => sum + row[metric], 0);
  const selectedCount = selectedCardRows.reduce((sum, row) => sum + row.count, 0);
  const bestMonth = selectedSeries.reduce((best, item) => item[metric] > (best?.[metric] ?? 0) ? item : best, null);
  const activeMonthCount = selectedSeries.filter((item) => item[metric] > 0).length;
  const averageMonthly = activeMonthCount ? selectedTotal / activeMonthCount : 0;
  const selectedCardName = selectedCard === 'all' ? 'All cards' : selectedCard === 'unknown' ? 'Unassigned' : cards.find((card) => String(card.id) === selectedCard)?.card_name || 'Selected card';

  useEffect(() => {
    if (!selectedMonth || mode !== 'live') { setTransactions([]); return; }
    const lastDay = new Date(selectedMonth.year, selectedMonth.month, 0).getDate();
    const params = {
      date_from: `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}-01`,
      date_to: `${selectedMonth.year}-${String(selectedMonth.month).padStart(2, '0')}-${lastDay}`,
      transaction_type: 'debit', is_fraud: false, is_excluded: false,
      sort_by: 'amount', limit: 15,
    };
    if (selectedCard !== 'all') params.card_id = selectedCard === 'unknown' ? 0 : Number(selectedCard);
    let active = true;
    setDetailLoading(true);
    getTransactions(params).then((result) => { if (active) setTransactions(result.transactions || []); })
      .catch((err) => { if (active) setError(err.message || 'Could not load this month’s transactions.'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [mode, selectedCard, selectedMonth]);

  const topCard = [...cardTotals].sort((a, b) => b[metric] - a[metric])[0];
  function toggleCard(key) {
    setVisibleCards((current) => {
      const active = current ?? cardTotals.map((card) => `card-${card.id ?? 'unknown'}`);
      const next = active.includes(key) ? active.filter((item) => item !== key) : [...active, key];
      return next.length === cardTotals.length ? null : next;
    });
  }

  if (mode === 'readonly') return <div className="ci-page"><header className="ci-header"><div><span className="ci-eyebrow">PORTFOLIO VIEW</span><h1>Card Insights</h1></div></header><div className="ci-empty">Card insights need a live connection to the local data store.</div></div>;

  return <div className="ci-page">
    <header className="ci-header">
      <div><span className="ci-eyebrow">YOUR CARD PORTFOLIO</span><h1>Card Insights <span className="ci-live-dot" /></h1><p>See what you spend, where it goes, and how your cards compare month by month.</p></div>
      <div className="ci-period-controls">
        <label><span>Through</span><select aria-label="Ending year" value={year} onChange={(event) => { setYear(Number(event.target.value)); setSelectedMonth(null); }}>
          {Array.from({ length: 11 }, (_, index) => currentYear - index).map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label><span>Window</span><select aria-label="Period length" value={yearRange} onChange={(event) => { setYearRange(Number(event.target.value)); setSelectedMonth(null); }}>
          {[1, 3, 5, 10].map((value) => <option key={value} value={value}>{value === 1 ? '1 year' : `${value} years`}</option>)}
        </select></label>
      </div>
    </header>

    <div className="ci-control-bar">
      <div className="ci-tabs" role="tablist" aria-label="Card dashboard view">
        {[['overview', '◫', 'Portfolio'], ['card', '▣', 'One card'], ['compare', '⇄', 'Compare']].map(([key, icon, label]) => <button key={key} role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => { setView(key); if (key !== 'card') setSelectedCard('all'); setSelectedMonth(null); }}><span>{icon}</span>{label}</button>)}
      </div>
      <div className="ci-segment" aria-label="Spending measure">
        <button className={metric === 'raw_total' ? 'active' : ''} onClick={() => setMetric('raw_total')}>Card charges</button>
        <button className={metric === 'total' ? 'active' : ''} onClick={() => setMetric('total')}>My share</button>
      </div>
    </div>

    {error && <div className="ci-error" role="alert">{error}</div>}
    {loading ? <div className="ci-empty">Loading your card portfolio…</div> : cards.length === 0 && rows.length === 0 ? <div className="ci-empty ci-empty-hero"><span>▣</span><h2>Your card story starts here</h2><p>Import or upload a statement and assign it to a card. Your month-by-month portfolio will appear here.</p><a href="/upload">Import a statement <span>→</span></a></div> : <>
      {view === 'card' && <div className="ci-card-picker" aria-label="Choose a card">
        {cardTotals.map((card, index) => <button key={card.id ?? 'unknown'} className={selectedCard === (card.id == null ? 'unknown' : String(card.id)) ? 'active' : ''} onClick={() => { setSelectedCard(card.id == null ? 'unknown' : String(card.id)); setSelectedMonth(null); }}><span className="ci-mini-card" style={{ '--card-color': card.id == null ? '#747894' : PALETTE[index % PALETTE.length] }}>▰</span><span><b>{card.card_name}</b><small>{card.bank_name || 'No card assigned'}{card.last_four ? ` ··${card.last_four}` : ''}</small></span></button>)}
        {cardTotals.length > 1 && <button className={selectedCard === 'all' ? 'active' : ''} onClick={() => { setSelectedCard('all'); setSelectedMonth(null); }}><span className="ci-mini-card ci-all-cards">✦</span><span><b>All cards</b><small>Combined spend</small></span></button>}
      </div>}

      {view === 'compare' && <div className="ci-card-toggles" aria-label="Cards to compare">
        {cardTotals.map((card, index) => {
          const key = `card-${card.id ?? 'unknown'}`;
          const active = visibleKeys.includes(key);
          return <button key={key} aria-pressed={active} onClick={() => toggleCard(key)} className={active ? '' : 'muted'}><i style={{ background: PALETTE[index % PALETTE.length] }} />{cardLabel(card)}</button>;
        })}
        <button className="ci-select-all" onClick={() => setVisibleCards(null)}>Show all</button>
      </div>}

      <section className="ci-metrics">
        <Metric label={view === 'card' ? `${selectedCardName} · period spend` : 'Total card spend'} value={money(view === 'card' ? selectedTotal : monthData.reduce((sum, month) => sum + month[metric], 0))} note={`${range.startYear}–${range.endYear} · ${metric === 'total' ? 'your share' : 'full statement charges'}`} icon="↗" />
        <Metric label="Monthly average" value={money(view === 'card' ? averageMonthly : (monthData.reduce((sum, month) => sum + month[metric], 0) / Math.max(1, monthData.filter((month) => month[metric] > 0).length)))} note="Across months with activity" icon="◷" />
        <Metric label="Highest spend month" value={bestMonth && bestMonth[metric] > 0 ? money(bestMonth[metric]) : '—'} note={bestMonth && bestMonth[metric] > 0 ? bestMonth.label : 'No activity in this period'} icon="⌁" />
        <Metric label={view === 'card' ? 'Transactions' : 'Top spending card'} value={view === 'card' ? selectedCount.toLocaleString('en-IN') : (topCard?.card_name || '—')} note={view === 'card' ? 'Eligible debit transactions' : topCard ? `${money(topCard[metric])} in this period` : 'No card activity'} icon="▤" />
      </section>

      {(view === 'overview' || view === 'compare') && <section className="ci-panel">
        <div className="ci-panel-heading"><div><span className="ci-kicker">MONTHLY TREND</span><h2>{view === 'compare' ? 'Compare card spend' : 'Combined spending'}</h2><p>{view === 'compare' ? 'Select cards above to compare their month-by-month pattern.' : 'Each color is a card. Select a month to drill into its largest transactions.'}</p></div><span className="ci-panel-range">{range.startYear} — {range.endYear}</span></div>
        {view === 'overview' ? <ResponsiveContainer width="100%" height={340}><BarChart data={monthData} margin={{ top: 12, right: 10, left: 4, bottom: 4 }} onClick={(event) => { const point = event?.activePayload?.[0]?.payload; if (point) setSelectedMonth(point); }}>
          <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#8e91ad', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis tick={{ fill: '#8e91ad', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : `₹${Math.round(value / 1000)}k`} />
          <Tooltip content={<CardTooltip />} cursor={{ fill: 'rgba(139,131,255,.08)' }} />
          {cardTotals.map((card, index) => <Bar key={card.id ?? 'unknown'} dataKey={`card-${card.id ?? 'unknown'}`} name={card.label} stackId="spend" fill={card.id == null ? '#747894' : PALETTE[index % PALETTE.length]} maxBarSize={34} radius={index === cardTotals.length - 1 ? [5, 5, 0, 0] : 0} cursor="pointer" />)}
        </BarChart></ResponsiveContainer> : <ResponsiveContainer width="100%" height={340}><LineChart data={monthData} margin={{ top: 12, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#8e91ad', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis tick={{ fill: '#8e91ad', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : `₹${Math.round(value / 1000)}k`} />
          <Tooltip content={<CardTooltip />} />
          {cardTotals.map((card, index) => visibleKeys.includes(`card-${card.id ?? 'unknown'}`) && <Line key={card.id ?? 'unknown'} type="monotone" dataKey={`card-${card.id ?? 'unknown'}`} name={card.label} stroke={card.id == null ? '#747894' : PALETTE[index % PALETTE.length]} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} connectNulls />)}
        </LineChart></ResponsiveContainer>}
        {view === 'overview' && <div className="ci-legend">{cardTotals.map((card, index) => <span key={card.id ?? 'unknown'}><i style={{ background: card.id == null ? '#747894' : PALETTE[index % PALETTE.length] }} />{card.label}</span>)}</div>}
        {view === 'compare' && visibleKeys.length === 0 && <div className="ci-chart-empty">Choose at least one card to show its monthly trend.</div>}
      </section>}

      {view === 'card' && <section className="ci-panel">
        <div className="ci-panel-heading"><div><span className="ci-kicker">CARD DETAIL</span><h2>{selectedCardName} · monthly spend</h2><p>Tap any month to inspect its largest transactions.</p></div><span className="ci-panel-range">{range.startYear} — {range.endYear}</span></div>
        <ResponsiveContainer width="100%" height={320}><LineChart data={selectedSeries} margin={{ top: 12, right: 12, left: 4, bottom: 4 }} onClick={(event) => { const point = event?.activePayload?.[0]?.payload; if (point) setSelectedMonth(point); }}>
          <CartesianGrid stroke="rgba(148,163,184,.10)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#8e91ad', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
          <YAxis tick={{ fill: '#8e91ad', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : `₹${Math.round(value / 1000)}k`} />
          <Tooltip content={<CardTooltip />} /><ReferenceLine y={0} stroke="rgba(148,163,184,.18)" />
          <Line type="monotone" dataKey={metric} name={metric === 'total' ? 'My share' : 'Full card charges'} stroke="#8b83ff" strokeWidth={3} dot={{ r: 3, fill: '#8b83ff' }} activeDot={{ r: 7 }} connectNulls />
        </LineChart></ResponsiveContainer>
      </section>}

      {view === 'overview' && <section className="ci-card-grid"><div className="ci-section-title"><div><span className="ci-kicker">YOUR WALLET</span><h2>Spend by card</h2></div><span>{cards.length} {cards.length === 1 ? 'card' : 'cards'}</span></div>
        {cardTotals.map((card, index) => <button className="ci-wallet-card" key={card.id ?? 'unknown'} onClick={() => { setView('card'); setSelectedCard(card.id == null ? 'unknown' : String(card.id)); setSelectedMonth(null); }} style={{ '--card-color': card.id == null ? '#747894' : PALETTE[index % PALETTE.length] }}><div className="ci-wallet-top"><span className="ci-wallet-chip">▦</span><span className="ci-wallet-arrow">↗</span></div><div className="ci-wallet-bank">{card.bank_name || 'Card not assigned'}</div><strong>{card.card_name}</strong><div className="ci-wallet-bottom"><span>{card.last_four ? `•••• ${card.last_four}` : 'Card spend'}</span><b>{money(card[metric])}</b></div><div className="ci-wallet-foot">{card.count} transactions <span>View card →</span></div></button>)}
      </section>}

      {selectedMonth && <section className="ci-panel ci-drilldown">
        <div className="ci-panel-heading"><div><span className="ci-kicker">MONTH DRILL-DOWN</span><h2>{MONTHS[selectedMonth.month - 1]} {selectedMonth.year}</h2><p>Largest charges first{selectedCard === 'all' && view === 'overview' ? ' · all cards' : ` · ${selectedCardName}`}</p></div><button className="ci-close" onClick={() => setSelectedMonth(null)}>Close ×</button></div>
        {detailLoading ? <div className="ci-chart-empty">Loading transactions…</div> : <div className="ci-table-wrap"><table className="ci-table"><thead><tr><th>Merchant</th><th>Card</th><th>Date</th><th>Category</th><th className="ci-right">Card charge</th><th className="ci-right">My share</th></tr></thead><tbody>
          {transactions.length ? transactions.map((transaction) => <tr key={transaction.id}><td><b>{transaction.display_merchant || transaction.merchant || 'Unknown merchant'}</b></td><td>{transaction.card_name || transaction.card?.display_name || 'Unassigned'}</td><td>{dateText(transaction.date)}</td><td>{transaction.display_category || transaction.category || 'Other'}</td><td className="ci-right">{money(transaction.amount)}</td><td className="ci-right">{money(transaction.personal_share ?? transaction.amount)}</td></tr>) : <tr><td colSpan="6" className="ci-no-rows">No eligible debit transactions found for this month.</td></tr>}
        </tbody></table></div>}
      </section>}
    </>}
    <footer className="ci-footnote">Spend is grouped by transaction purchase date and excludes fraud, excluded items, and credits. {metric === 'total' ? 'My share uses your personal split amount.' : 'Card charges show the full transaction amount.'}</footer>
  </div>;
}
