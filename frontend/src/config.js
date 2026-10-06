// Default backend IP — user can change in Settings
const BACKEND_IP = localStorage.getItem('backend_ip') || '192.168.1.1';
const BACKEND_PORT = localStorage.getItem('backend_port') || '8000';

export function getBackendUrl() {
  const ip = localStorage.getItem('backend_ip') || BACKEND_IP;
  const port = localStorage.getItem('backend_port') || BACKEND_PORT;
  return `http://${ip}:${port}`;
}
