/**
 * Fiscal printing — Accent PF-500, file-exchange protocol.
 *
 * The legacy WinApp printed fiscal receipts by dropping command files into a
 * folder watched by the Accent vendor driver on the operator's PC. v2 keeps the
 * exact same integration: the server composes the file bytes
 * (GET /payment-documents/{id}/fiscal-file) and the browser writes them into the
 * operator's fiscal folder via the File System Access API (Chrome/Edge).
 * The driver and folder already exist on every operator PC — nothing to install.
 *
 * The folder handle is remembered in IndexedDB; the browser re-asks for
 * permission with one click per session when needed.
 */
import { api } from '@/api/client';

// --- minimal File System Access API typings (not yet in lib.dom) ---
declare global {
  interface Window {
    showDirectoryPicker(options?: { id?: string; mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission(d?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(d?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

const DB_NAME = 'vte-fiscal';
const STORE = 'kv';
const KEY = 'fiscal-folder';

export function isFiscalSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    tx.onsuccess = () => resolve(tx.result as T | undefined);
    tx.onerror = () => reject(tx.error);
  });
}
async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbDel(key: string): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
    tx.onsuccess = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** The remembered folder, if any — does NOT prompt. */
export async function getSavedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try { return (await idbGet<FileSystemDirectoryHandle>(KEY)) ?? null; }
  catch { return null; }
}

/** Ask the user to pick the fiscal folder (must be called from a user gesture). */
export async function pickFiscalFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await window.showDirectoryPicker({ id: 'vte-fiscal', mode: 'readwrite' });
  await idbSet(KEY, handle);
  return handle;
}

export async function clearFiscalFolder(): Promise<void> {
  await idbDel(KEY);
}

/** Saved folder with permission ensured. Returns null when not configured or denied.
 *  May show the browser's one-click permission prompt (needs a user gesture). */
export async function ensureFolder(interactive: boolean): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getSavedFolder();
  if (!handle) return null;
  let perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'prompt' && interactive) perm = await handle.requestPermission({ mode: 'readwrite' });
  return perm === 'granted' ? handle : null;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Write bytes into the fiscal folder. createWritable() is atomic on close, so the
 *  driver never sees a partially-written file (replaces the legacy .tx→.txt dance). */
export async function writeFiscalFile(folder: FileSystemDirectoryHandle, fileName: string, bytes: Uint8Array): Promise<void> {
  const fh = await folder.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(bytes.buffer as ArrayBuffer);
  await w.close();
}

export type FiscalPrintResult =
  | { status: 'printed'; fileName: string }
  | { status: 'skipped'; reason: string }      // bill doesn't fiscalize (non-cash / zero)
  | { status: 'no-folder' }                    // fiscal folder not configured / denied
  | { status: 'unsupported' }                  // browser without File System Access API
  | { status: 'error'; message: string };

/** Full receipt flow: fetch composed file → write to folder → confirm outbox.
 *  Pass installmentSeq for a rata ("Uplata po rata") receipt — those don't touch
 *  the document-level FiscalPrintedAt marker. */
export async function printFiscalForDocument(
  documentId: number | string, interactive = true, installmentSeq?: number,
): Promise<FiscalPrintResult> {
  if (!isFiscalSupported()) return { status: 'unsupported' };
  try {
    const { data } = await api.get<{
      printsFiscal: boolean; skipReason: string | null;
      fileName: string; contentBase64: string; fiscalPrintedAt: string | null;
    }>(`/payment-documents/${documentId}/fiscal-file`, {
      params: installmentSeq != null ? { installment: installmentSeq } : undefined,
    });

    if (!data.printsFiscal) return { status: 'skipped', reason: data.skipReason ?? '' };

    const folder = await ensureFolder(interactive);
    if (!folder) return { status: 'no-folder' };

    await writeFiscalFile(folder, data.fileName, base64ToBytes(data.contentBase64));
    if (installmentSeq == null)
      await api.post(`/payment-documents/${documentId}/fiscal-printed`);
    return { status: 'printed', fileName: data.fileName };
  } catch (e: any) {
    return { status: 'error', message: e?.response?.data?.error ?? e?.message ?? String(e) };
  }
}

// --- one-line driver commands (legacy FiskalModule parity) ---

const ascii = (s: string) => new TextEncoder().encode(s);

/** Z report — daily fiscal closure. Legacy: " E" (PecatiDnevnoFiskalnoZatvaranjePF500). */
export async function printDailyClosure(folder: FileSystemDirectoryHandle): Promise<void> {
  await writeFiscalFile(folder, 'DnevnoFiskalnoZatvaranje.txt', ascii(' E\r\n'));
}

/** X report — daily control report (no closure). Legacy: " E2". */
export async function printControlReport(folder: FileSystemDirectoryHandle): Promise<void> {
  await writeFiscalFile(folder, 'DnevenKontrolenIzvestaj.txt', ascii(' E2\r\n'));
}

/** Тест-фискална сметка: една ставка „Proba" од 1.00 ден. (ДДВ А 18%) — печати
 *  ВИСТИНСКА сметка на уредот, за проверка дека печатачот е жив. Ист бајт-формат
 *  како серверскиот composer: header → '1 + име + таб + ДДВ-бајт 192 + износ →
 *  subtotal → затворање (%8). Уникатно име за да може да се повтори пробата. */
export async function printTestReceipt(folder: FileSystemDirectoryHandle): Promise<string> {
  const head = ascii(" 01,0000,1\r\n'1Proba\t");
  const tail = ascii("1.00\r\n 5 Smetka\t\r\n%8\r\n");
  const bytes = new Uint8Array(head.length + 1 + tail.length);
  bytes.set(head, 0);
  bytes[head.length] = 192;                       // ДДВ класа А (18%), CP1251
  bytes.set(tail, head.length + 1);
  const fileName = `TestSmetka${Date.now()}.txt`;
  await writeFiscalFile(folder, fileName, bytes);
  return fileName;
}
