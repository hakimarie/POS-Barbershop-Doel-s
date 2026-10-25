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

export async function loadOfflineDrafts(storageKey: string): Promise<OfflineDraftRecord[]> {
  try {
    const db = await openDraftDatabase(storageKey);
    const rows = await new Promise<OfflineDraftRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as OfflineDraftRecord[]);
      request.onerror = () => reject(request.error ?? new Error("Gagal membaca draft."));
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error ?? new Error("Gagal membaca draft."));
    });
    if (rows.length) return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Migrate drafts created by the previous localStorage implementation.
    const legacy = readLegacyDrafts(storageKey);
    if (legacy.length) {
      await saveOfflineDrafts(storageKey, legacy);
      try { window.localStorage.removeItem(storageKey); } catch { /* Keep IndexedDB copy. */ }
    }
    return legacy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return readLegacyDrafts(storageKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

export async function saveOfflineDrafts(storageKey: string, drafts: OfflineDraftRecord[]): Promise<void> {
  const normalized = drafts.filter((draft) => Boolean(draft.transactionId));
  const db = await openDraftDatabase(storageKey);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    for (const draft of normalized) store.put(draft);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Gagal menyimpan draft.")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Penyimpanan draft dibatalkan.")); };
  });
}

export async function removeOfflineDrafts(storageKey: string): Promise<void> {
  const db = await openDraftDatabase(storageKey);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Gagal membersihkan draft.")); };
  });
}
