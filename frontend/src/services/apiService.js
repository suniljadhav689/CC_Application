/**
 * apiService.js
 * Unified data access layer — routes to backend API.
 */
import { getBackendUrl } from '../config';

async function request(path, options = {}) {
  const url = `${getBackendUrl()}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

// ── Transactions ────────────────────────────────────────────────────────── //
export async function getTransactions(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') q.append(k, v); });
  return request(`/transactions/?${q}`);
}

export async function updateTransaction(id, data) {
  return request(`/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function bulkUpdateTransactions(ids, data) {
  return request('/transactions/bulk-update', { method: 'POST', body: JSON.stringify({ ids, ...data }) });
}

export async function deleteTransaction(id) {
  return request(`/transactions/${id}`, { method: 'DELETE' });
}

// ── Analytics ───────────────────────────────────────────────────────────── //
export async function getSummary(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.append(k, v); });
  return request(`/analytics/summary?${q}`);
}

export async function getByCategory(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.append(k, v); });
  return request(`/analytics/by-category?${q}`);
}

export async function getByMonth(year) {
  return request(`/analytics/by-month${year ? `?year=${year}` : ''}`);
}

export async function getByCard(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.append(k, v); });
  return request(`/analytics/by-card?${q}`);
}

export async function getTopMerchants(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.append(k, v); });
  return request(`/analytics/top-merchants?${q}`);
}

// ── Statements ──────────────────────────────────────────────────────────── //
export async function getStatements() {
  return request('/statements/');
}

export async function uploadStatement(file, cardId) {
  const formData = new FormData();
  formData.append('file', file);
  if (cardId) formData.append('card_id', cardId);

  const url = `${getBackendUrl()}/statements/upload`;
  const res = await fetch(url, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function confirmStatement(statementId, transactions) {
  return request(`/statements/${statementId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ transactions }),
  });
}

export async function deleteStatement(id) {
  return request(`/statements/${id}`, { method: 'DELETE' });
}

// ── Backup ──────────────────────────────────────────────────────────────── //
export function downloadSQLite() {
  window.open(`${getBackendUrl()}/backup/sqlite`, '_blank');
}

export function downloadCSV() {
  window.open(`${getBackendUrl()}/backup/csv`, '_blank');
}

export function downloadExcel() {
  window.open(`${getBackendUrl()}/backup/excel`, '_blank');
}
