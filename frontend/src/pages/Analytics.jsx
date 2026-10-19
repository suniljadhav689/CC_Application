import { useEffect, useMemo, useState } from 'react';
import { getByMonth, getByCategory, getByCard, getTopMerchants, getTransactions, getCardMonthlySpend, getCards } from '../services/apiService';
import useStore from '../store/useStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COLORS = ['#6c63ff', '#ff6b9d', '#00d2b4', '#f59e0b', '#a855f7', '#22c55e', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];

function formatINR(n) { return '₹' + Math.round(n || 0).toLocaleString('en-IN'); }
function formatDate(d) { return d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; }

export default function Analytics() {
  const mode = useStore((s) => s.mode);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthData, setMonthData] = useState([]);
  const [catData, setCatData] = useState([]);
  const [cardData, setCardData] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [largeTransactions, setLargeTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [knownCards, setKnownCards] = useState([]);
  const [cardMonthRows, setCardMonthRows] = useState([]);
  const [comparisonYears, setComparisonYears] = useState(3);
  const [comparisonMetric, setComparisonMetric] = useState('raw_total');
  const [visibleCards, setVisibleCards] = useState(null);

  const yearParams = useMemo(() => ({ date_from: `${year}-01-01`, date_to: `${year}-12-31` }), [year]);

  useEffect(() => {
    if (mode === 'checking' || mode === 'readonly') return;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      getByMonth(year),
      getByCategory(yearParams),
      getByCard(yearParams),
      getTopMerchants({ ...yearParams, limit: 10 }),
    ]).then(([months, categories, cards, topMerchants]) => {
      if (!active) return;
      setMonthData(months.map((row) => ({ ...row, name: MONTH_NAMES[row.month - 1].slice(0, 3) })));
      setCatData(categories);
      setCardData(cards);
      setMerchants(topMerchants);
      setSelectedMonth((current) => current && months.some((row) => row.month === current) ? current : null);
    }).catch((e) => { if (active) setError(e.message || 'Could not load analytics.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode, year, yearParams]);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    const fromYear = year - comparisonYears + 1;
    Promise.all([getCards(), getCardMonthlySpend(fromYear, year)]).then(([cards, rows]) => {
      if (!active) return;
      setKnownCards(cards);
      setCardMonthRows(rows);
    }).catch((e) => { if (active) setError(e.message || 'Could not load monthly card comparison.'); });
    return () => { active = false; };
  }, [mode, year, comparisonYears]);

  useEffect(() => {
    if (!selectedMonth || mode !== 'live') { setLargeTransactions([]); return; }
    const start = `${year}-${String(selectedMonth).padStart(2, '0')}-01`;
    const end = `${year}-${String(selectedMonth).padStart(2, '0')}-${String(new Date(year, selectedMonth, 0).getDate()).padStart(2, '0')}`;
    let active = true;
    setDetailLoading(true);
    getTransactions({ date_from: start, date_to: end, transaction_type: 'debit', is_fraud: false, is_excluded: false, sort_by: 'amount', limit: 20 })
      .then((result) => { if (active) setLargeTransactions(result.transactions); })
      .catch((e) => { if (active) setError(e.message || 'Could not load monthly transactions.'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [mode, year, selectedMonth]);

  if (mode === 'readonly') {
    return <div><div className="page-header"><h1 className="page-title">Analytics</h1></div><div className="readonly-banner">⚠️ Analytics require live backend connection.</div></div>;
  }

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return <div style={{ background: '#141428', border: '1px solid #2a2a4a', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((item, i) => <div key={i} style={{ color: item.color, fontSize: 13 }}>{item.name}: {formatINR(item.value)}</div>)}
    </div>;
  };

  const selectedSummary = monthData.find((item) => item.month === selectedMonth);
  const comparisonCardMap = new Map();
  knownCards.forEach((card) => comparisonCardMap.set(`card-${card.id}`, card.display_name));
  cardMonthRows.forEach((row) => {
    const key = `card-${row.card_id ?? 'unknown'}`;
    if (!comparisonCardMap.has(key)) comparisonCardMap.set(key, row.card_name || 'Unknown card');
  });
  const comparisonKeys = [...comparisonCardMap.keys()];
  const comparisonDataMap = new Map();
  cardMonthRows.forEach((row) => {
    const key = `card-${row.card_id ?? 'unknown'}`;
    const label = `${MONTH_NAMES[row.month - 1].slice(0, 3)} '${String(row.year).slice(-2)}`;
    if (!comparisonDataMap.has(row.month_key)) comparisonDataMap.set(row.month_key, { month_key: row.month_key, label });
    comparisonDataMap.get(row.month_key)[key] = row[comparisonMetric];
  });
  const cardComparisonData = [...comparisonDataMap.values()].sort((a, b) => a.month_key.localeCompare(b.month_key));
  const shownCardKeys = visibleCards === null ? comparisonKeys : visibleCards;

  return <div>
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div><h1 className="page-title">Spending Analytics</h1><p className="page-subtitle">Explore spend by transaction date, month, category, and card</p></div>
      <select aria-label="Analytics year" className="form-select" style={{ width: 120 }} value={year} onChange={(e) => { setYear(+e.target.value); setSelectedMonth(null); }}>
        {Array.from({ length: Math.max(4, new Date().getFullYear() - 2022) }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>

    {error && <div className="readonly-banner" role="alert">{error}</div>}
    {loading ? <div className="loading-screen"><div className="spinner" /><span>Crunching numbers...</span></div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section className="chart-card">
        <div className="chart-title">Month-by-month spending · {year}</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>Months are based on each transaction’s purchase date. Select a bar or month to see its largest charges.</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthData} onClick={(state) => { const item = state?.activePayload?.[0]?.payload; if (item) setSelectedMonth(item.month); }} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#9090b8', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#9090b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(108,99,255,0.1)' }} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: '#9090b8' }} />
            <Bar name="Personal spend" dataKey="total" fill="#6c63ff" radius={[4, 4, 0, 0]} maxBarSize={34} cursor="pointer" />
            <Bar name="Full card charges" dataKey="raw_total" fill="#3b82f6" fillOpacity={0.5} radius={[4, 4, 0, 0]} maxBarSize={34} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
        <div className="table-wrapper" style={{ border: 'none', marginTop: 12 }}><table>
          <thead><tr><th>Month</th><th style={{ textAlign: 'right' }}>My spend</th><th style={{ textAlign: 'right' }}>Full charges</th><th style={{ textAlign: 'right' }}>Transactions</th></tr></thead>
          <tbody>{monthData.length ? monthData.map((item) => <tr key={item.month} onClick={() => setSelectedMonth(item.month)} style={{ cursor: 'pointer', background: selectedMonth === item.month ? 'rgba(108,99,255,0.12)' : undefined }}>
            <td><button className="btn btn-ghost btn-sm" aria-label={`View ${MONTH_NAMES[item.month - 1]} ${year} transactions`}>{MONTH_NAMES[item.month - 1]} ›</button></td>
            <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(item.total)}</td><td style={{ textAlign: 'right' }}>{formatINR(item.raw_total)}</td><td style={{ textAlign: 'right' }}>{item.count}</td>
          </tr>) : <tr><td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No transactions found for {year}.</td></tr>}</tbody>
        </table></div>
      </section>

      <section className="chart-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div><div className="chart-title">Monthly spend comparison by card</div><p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '-10px 0 14px' }}>Compare cards month by month across years. Select a year range and tap cards to show or hide them.</p></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select aria-label="Spend measure" className="form-select" style={{ width: 170 }} value={comparisonMetric} onChange={(e) => setComparisonMetric(e.target.value)}>
              <option value="raw_total">Full card charges</option><option value="total">My share</option>
            </select>
            <select aria-label="Comparison year range" className="form-select" style={{ width: 145 }} value={comparisonYears} onChange={(e) => setComparisonYears(Number(e.target.value))}>
              {[1, 3, 5, 10].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'year' : 'years'}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {comparisonKeys.map((key, i) => {
            const visible = shownCardKeys.includes(key);
            return <button key={key} type="button" aria-pressed={visible} onClick={() => setVisibleCards((current) => {
              const selected = current === null ? comparisonKeys : current;
              const next = selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key];
              return next.length === comparisonKeys.length ? null : next;
            })} style={{ border: `1px solid ${COLORS[i % COLORS.length]}`, borderRadius: 20, padding: '5px 10px', background: visible ? `${COLORS[i % COLORS.length]}22` : 'transparent', color: visible ? COLORS[i % COLORS.length] : 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>{comparisonCardMap.get(key)}</button>;
          })}
        </div>
        {cardComparisonData.length && shownCardKeys.length ? <ResponsiveContainer width="100%" height={310}>
          <LineChart data={cardComparisonData} margin={{ top: 5, right: 12, left: 8, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#9090b8', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={14} />
            <YAxis tick={{ fill: '#9090b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            {shownCardKeys.map((key) => <Line key={key} type="monotone" dataKey={key} name={comparisonCardMap.get(key)} stroke={COLORS[comparisonKeys.indexOf(key) % COLORS.length]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />)}
          </LineChart>
        </ResponsiveContainer> : <div style={{ padding: 35, textAlign: 'center', color: 'var(--text-muted)' }}>{comparisonCardMap.size ? 'Select at least one card to show.' : `No card-linked spending found from ${year - comparisonYears + 1} to ${year}.`}</div>}
      </section>

      {selectedMonth && <section className="chart-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div><div className="chart-title">Largest transactions · {MONTH_NAMES[selectedMonth - 1]} {year}</div><p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Top 20 eligible debit transactions, ranked by full charge amount.</p></div>
          {selectedSummary && <div style={{ textAlign: 'right' }}><strong>{formatINR(selectedSummary.total)}</strong><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>personal spend</div></div>}
        </div>
        {detailLoading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading transactions…</div> : <div className="table-wrapper" style={{ border: 'none', marginTop: 14 }}><table>
          <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th style={{ textAlign: 'right' }}>Card charge</th><th style={{ textAlign: 'right' }}>My share</th></tr></thead>
          <tbody>{largeTransactions.length ? largeTransactions.map((txn) => <tr key={txn.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{formatDate(txn.date)}</td><td>{txn.display_merchant || txn.merchant || 'Unknown'}</td><td>{txn.display_category || txn.category || 'Other'}</td>
            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{formatINR(txn.amount)}</td><td style={{ textAlign: 'right' }}>{formatINR(txn.personal_share)}</td>
          </tr>) : <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No eligible debit transactions for this month.</td></tr>}</tbody>
        </table></div>}
      </section>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <section className="chart-card"><div className="chart-title">Category breakdown · {year}</div>
          {catData.length ? <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={catData} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2}>{catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v) => formatINR(v)} /><Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#9090b8' }} /></PieChart></ResponsiveContainer> : <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No data for {year}.</div>}
        </section>
        <section className="chart-card"><div className="chart-title">Spend by card · {year}</div>
          {cardData.length ? cardData.map((card, i) => <div key={card.card_id ?? card.card_name} style={{ marginTop: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{card.card_name}</span><strong style={{ color: COLORS[i % COLORS.length] }}>{formatINR(card.total)}</strong></div><div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{card.count} transactions</div></div>) : <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>No card-linked transactions for {year}.</div>}
        </section>
      </div>

      <section className="chart-card"><div className="chart-title">Top merchants · {year}</div><div className="table-wrapper" style={{ border: 'none' }}><table>
        <thead><tr><th>#</th><th>Merchant</th><th style={{ textAlign: 'right' }}>My spend</th><th style={{ textAlign: 'right' }}>Transactions</th><th style={{ textAlign: 'right' }}>Average</th></tr></thead>
        <tbody>{merchants.length ? merchants.map((merchant, i) => <tr key={merchant.merchant}><td>{i + 1}</td><td>{merchant.merchant}</td><td style={{ textAlign: 'right', fontWeight: 700, color: COLORS[i % COLORS.length] }}>{formatINR(merchant.total)}</td><td style={{ textAlign: 'right' }}>{merchant.count}</td><td style={{ textAlign: 'right' }}>{formatINR(merchant.total / merchant.count)}</td></tr>) : <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No merchant data for {year}.</td></tr>}</tbody>
      </table></div></section>
    </div>}
  </div>;
}
