import { DIAGNOSTIC_CHUNK_BYTES, DIAGNOSTIC_ENDPOINT, DiagnosticReceipt } from '../domain/diagnosticReport';
const RECEIPTS_KEY = 'blink-coach-diagnostic-receipts-v1';
export function readReceipts(): DiagnosticReceipt[] {
  try { const parsed = JSON.parse(localStorage.getItem(RECEIPTS_KEY) ?? '[]'); return Array.isArray(parsed) ? parsed.filter(r => /^[a-f0-9-]{36}$/.test(r.id) && /^[a-f0-9]{64}$/.test(r.token)).slice(0, 500) : []; } catch { return []; }
}
export function rememberReceipt(receipt: DiagnosticReceipt): void {
  // Fail before uploading if we cannot retain the deletion credential.
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify([receipt, ...readReceipts().filter(r => r.id !== receipt.id)].slice(0, 500)));
}
export function createReceipt(): DiagnosticReceipt {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  return { id: crypto.randomUUID(), token, status: 'pending' };
}
async function api(path: string, receipt: DiagnosticReceipt, options: RequestInit): Promise<{ status?: 'pending' | 'ready'; expires?: number }> {
  const response = await fetch(DIAGNOSTIC_ENDPOINT + path, { ...options, credentials: 'omit', headers: { ...options.headers, Authorization: `Bearer ${receipt.token}` } });
  let data; try { data = await response.json(); } catch { throw new Error('The private report service is not available yet. Your recording has not been confirmed as received.'); }
  if (!response.ok) throw new Error(data.error ?? 'Sending failed. Your recording is still here; please retry.');
  return data;
}
export async function sendDiagnostic(blob: Blob, metadata: Record<string, unknown>, receipt: DiagnosticReceipt, signal: AbortSignal, onProgress: (percent: number) => void): Promise<DiagnosticReceipt> {
  rememberReceipt(receipt);
  const body = JSON.stringify({ ...metadata, id: receipt.id });
  if (new TextEncoder().encode(body).length > 512 * 1024) throw new Error('The diagnostic data is too large. Please record a shorter clip.');
  const started = await api('', receipt, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body });
  if (started.status !== 'ready') {
    for (let start = 0, index = 0; start < blob.size; start += DIAGNOSTIC_CHUNK_BYTES, index++) {
      await api(`/${receipt.id}/chunks/${index}`, receipt, { method: 'PUT', signal, headers: { 'Content-Type': 'application/octet-stream' }, body: blob.slice(start, start + DIAGNOSTIC_CHUNK_BYTES) });
      onProgress(Math.round(Math.min(start + DIAGNOSTIC_CHUNK_BYTES, blob.size) / blob.size * 95));
    }
  }
  const completed = await api(`/${receipt.id}/complete`, receipt, { method: 'POST', signal });
  if (completed.status !== 'ready' || typeof completed.expires !== 'number') throw new Error('The service has not confirmed receipt. Please retry sending.');
  const saved: DiagnosticReceipt = { ...receipt, status: 'ready', expires: completed.expires };
  rememberReceipt(saved); onProgress(100); return saved;
}
export async function deleteDiagnostic(receipt: DiagnosticReceipt): Promise<void> {
  const response = await fetch(`${DIAGNOSTIC_ENDPOINT}/${receipt.id}`, { method: 'DELETE', credentials: 'omit', headers: { Authorization: `Bearer ${receipt.token}` } });
  if (!response.ok && response.status !== 404) throw new Error('Could not confirm deletion. Please retry when connected.');
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify(readReceipts().filter(r => r.id !== receipt.id)));
}
