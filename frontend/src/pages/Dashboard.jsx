import { useEffect, useState } from 'react';
import { getSummary, getByMonth, getByCategory, getTopMerchants } from '../services/apiService';
import useStore from '../store/useStore';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Sector
} from 'recharts';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORY_COLORS = ['#6c63ff', '#ff6b9d', '#00d2b4', '#f59e0b', '#a855f7', '#22c55e', '#3b82f6', '#ec4899', '#14b8a6', '#f97316'];

function formatINR(n) {
  if (!n && n !== 0) return '—';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export default function Dashboard() {
  const mode = useStore((s) => s.mode);
  const [summary, setSummary] = useState(null);
  const [monthData, setMonthData] = useState([]);
  const [catData, setCatData] = useState([]);
  const [topMerch, setTopMerch] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePie, setActivePie] = useState(0);

  useEffect(() => {
    if (mode === 'checking') return;
    if (mode !== 'live') { setLoading(false); return; }

    const year = new Date().getFullYear();
    Promise.all([
      getSummary(),
      getByMonth(year),
      getByCategory(),
      getTopMerchants({ limit: 5 }),
    ]).then(([s, m, c, t]) => {
      setSummary(s);
      setMonthData(m.map((r) => ({ name: MONTH_NAMES[r.month - 1], total: r.total })));
      setCatData(c.slice(0, 8));
      setTopMerch(t);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [mode]);

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.6;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>{`${(percent * 100).toFixed(0)}%`}</text>;
  };

  if (mode === 'readonly') {
    return (
      <div>
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="readonly-banner">⚠️ Backend offline — showing last synced data. Connect to home Wi-Fi to enable full access.</div>
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📡</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>No cached data available</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Connect to your home Wi-Fi and open the app to sync data.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} overview</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-screen"><div className="spinner" /><span>Loading your data...</span></div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="stat-grid">
            <div className="stat-card purple">
              <div className="stat-label">Total Spend</div>
              <div className="stat-value">{formatINR(summary?.total_spend)}</div>
              <div className="stat-sub">{summary?.total_transactions} transactions</div>
              <div className="stat-icon">💳</div>
            </div>
            <div className="stat-card green">
              <div className="stat-label">My Spend</div>
              <div className="stat-value">{formatINR(summary?.my_spend)}</div>
              <div className="stat-sub">Personal expenses</div>
              <div className="stat-icon">👤</div>
            </div>
            <div className="stat-card" style={{ '--c': 'var(--friends)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--friends)' }} />
              <div className="stat-label">Friends Spend</div>
              <div className="stat-value" style={{ color: 'var(--friends)' }}>{formatINR(summary?.friends_spend)}</div>
              <div className="stat-sub">Paid for friends</div>
              <div className="stat-icon">👫</div>
            </div>
            <div className="stat-card red">
              <div className="stat-label">Fraud Flagged</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{summary?.fraud_count ?? 0}</div>
              <div className="stat-sub">Transactions flagged</div>
              <div className="stat-icon">🚨</div>
            </div>
          </div>

          {/* Monthly Chart */}
          <div className="chart-card" style={{ marginBottom: 24 }}>
            <div className="chart-title">Monthly Spend — {new Date().getFullYear()}</div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6c63ff" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6c63ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" tick={{ fill: '#9090b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9090b8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: '#141428', border: '1px solid #2a2a4a', borderRadius: 10, color: '#f0f0ff' }}
                  formatter={(v) => [formatINR(v), 'Spend']}
                />
                <Area type="monotone" dataKey="total" stroke="#6c63ff" strokeWidth={2.5} fill="url(#spendGrad)" dot={{ fill: '#6c63ff', r: 4 }} activeDot={{ r: 6 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Category Pie */}
            <div className="chart-card">
              <div className="chart-title">By Category</div>
              {catData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={catData} dataKey="total" nameKey="category" cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                      labelLine={false} label={renderPieLabel}
                      activeIndex={activePie} onMouseEnter={(_, i) => setActivePie(i)}>
                      {catData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#141428', border: '1px solid #2a2a4a', borderRadius: 10 }} formatter={(v) => formatINR(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8 }}>
                {catData.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }} />
                    {c.category}
                  </div>
                ))}
              </div>
            </div>

            {/* Top Merchants */}
            <div className="chart-card">
              <div className="chart-title">Top Merchants</div>
              {topMerch.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No data yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                  {topMerch.map((m, i) => {
                    const maxTotal = topMerch[0]?.total || 1;
                    const pct = (m.total / maxTotal) * 100;
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{m.merchant || 'Unknown'}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-light)' }}>{formatINR(m.total)}</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--bg-input)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: `linear-gradient(90deg, var(--accent), var(--accent-2))`, borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
