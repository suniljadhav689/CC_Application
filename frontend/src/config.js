export function getBackendUrl() {
  // Same-origin requests work over Tailscale HTTPS and avoid mixed-content/CORS issues.
  const ip = localStorage.getItem('backend_ip')?.trim();
  if (!ip) return '/api';
  const port = localStorage.getItem('backend_port')?.trim() || '8000';
  return `http://${ip}:${port}`;
}
