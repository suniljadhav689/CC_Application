import { useEffect, useMemo, useState } from 'react';
import { getByMonth, getByCategory, getByCard, getTopMerchants, getTransactions } from '../services/apiService';
import useStore from '../store/useStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
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
