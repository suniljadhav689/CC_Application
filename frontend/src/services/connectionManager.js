/**
 * connectionManager.js
 * Pings the backend every 30s to detect live vs read-only mode.
 */
import { getBackendUrl } from '../config';
import useStore from '../store/useStore';

let intervalId = null;

export async function checkConnection() {
  const store = useStore.getState();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(`${getBackendUrl()}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      store.setMode('live');
      store.setLastSyncedAt(new Date().toISOString());
      return 'live';
    }
  } catch (_) {
    // Backend not reachable
  }
  store.setMode('readonly');
  return 'readonly';
}

export function startConnectionMonitor() {
  // Immediate first check
  checkConnection();
  // Then every 30 seconds
  intervalId = setInterval(checkConnection, 30_000);
}

export function stopConnectionMonitor() {
  if (intervalId) clearInterval(intervalId);
}
