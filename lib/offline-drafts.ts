export type OfflineDraftRecord = {
  transactionId: string;
  branchId: string;
  deviceId: string;
  shiftId: string;
  serviceId: string;
  barberId: string;
  quantity: string;
  totalAtDraft: number;
  branchLabel: string;
  serviceLabel: string;
  barberLabel: string;
  createdAt: string;
};

const DB_VERSION = 1;
const STORE_NAME = "drafts";

function openDraftDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak tersedia di browser ini."));
      return;
    }
    const request = indexedDB.open(databaseName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "transactionId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Gagal membuka penyimpanan draft."));
    request.onblocked = () => reject(new Error("Penyimpanan draft sedang dibuka tab lain. Tutup tab POS duplikat lalu coba lagi."));
  });
}

function readLegacyDrafts(storageKey: string): OfflineDraftRecord[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineDraftRecord =>
      Boolean(item && typeof item === "object" &&
        typeof item.transactionId === "string" &&
        typeof item.branchId === "string" &&
        typeof item.deviceId === "string" &&
        typeof item.shiftId === "string" &&
        typeof item.serviceId === "string" &&
        typeof item.barberId === "string" &&
        typeof item.createdAt === "string")
    );
  } catch {
    return [];
  }
}

function runDraftTransaction<T>(
  databaseName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason: Error) => void) => void,
): Promise<T> {
  return openDraftDatabase(databaseName).then((db) => new Promise<T>((resolve, reject) => {
    let settled = false;
    const tx = db.transaction(STORE_NAME, mode);
    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      db.close();
      resolve(value);
    };
    const fail = (reason: Error) => {
      if (settled) return;
      settled = true;
      db.close();
      reject(reason);
    };
    tx.oncomplete = () => {
      if (!settled) finish(undefined as T);
    };
    tx.onerror = () => fail(tx.error ?? new Error("Transaksi penyimpanan draft gagal."));
    tx.onabort = () => fail(tx.error ?? new Error("Transaksi penyimpanan draft dibatalkan."));
    try {
      run(tx.objectStore(STORE_NAME), finish, fail);
    } catch (error) {
      tx.abort();
      fail(error instanceof Error ? error : new Error("Operasi draft gagal."));
    }
  }));
}

export async function loadOfflineDrafts(storageKey: string): Promise<OfflineDraftRecord[]> {
  try {
    const rows = await runDraftTransaction<OfflineDraftRecord[]>(storageKey, "readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as OfflineDraftRecord[]);
      request.onerror = () => reject(request.error ?? new Error("Gagal membaca draft."));
    });
    if (rows.length) return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Import legacy localStorage records without clearing any IndexedDB data.
    const legacy = readLegacyDrafts(storageKey);
    if (legacy.length) {
      await saveOfflineDrafts(storageKey, legacy);
      try { window.localStorage.removeItem(storageKey); } catch { /* IndexedDB copy remains authoritative. */ }
    }
    return legacy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    // Do not silently pretend that localStorage is a writable fallback.
    // It is read only here to allow recovery/export of older drafts.
    return readLegacyDrafts(storageKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/**
 * Upsert only the supplied transaction IDs. Never clear the object store:
 * separate tabs and overlapping writes must not erase unrelated drafts.
 */
export async function saveOfflineDrafts(storageKey: string, drafts: OfflineDraftRecord[]): Promise<void> {
  const normalized = drafts.filter((draft) => Boolean(draft.transactionId));
  if (!normalized.length) return;
  await runDraftTransaction<void>(storageKey, "readwrite", (store, _resolve, reject) => {
    for (const draft of normalized) {
      const request = store.put(draft);
      request.onerror = () => reject(request.error ?? new Error("Gagal menyimpan draft."));
    }
  });
}

export async function removeOfflineDraft(storageKey: string, transactionId: string): Promise<void> {
  if (!transactionId) throw new Error("ID transaksi wajib diisi.");
  await runDraftTransaction<void>(storageKey, "readwrite", (store, _resolve, reject) => {
    const request = store.delete(transactionId);
    request.onerror = () => reject(request.error ?? new Error("Gagal menghapus draft."));
  });
}

/** Administrative cleanup only; normal cashier flows must delete by ID. */
export async function removeOfflineDrafts(storageKey: string): Promise<void> {
  await runDraftTransaction<void>(storageKey, "readwrite", (store, _resolve, reject) => {
    const request = store.clear();
    request.onerror = () => reject(request.error ?? new Error("Gagal membersihkan draft."));
  });
}
