const DB_NAME = 'ChatExplorerDB';
const STORE_NAME = 'appState';

function getDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = e => resolve(e.target.result);
    request.onerror = () => reject('DB Error');
  });
}

export async function saveStateToDB(messages, media, myNamesRaw, excludeRaw, aliasRaw, dateFormat) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const snapshot = { messages, media, myNamesRaw, excludeRaw, aliasRaw, dateFormat, _schemaVersion: 2 };
  tx.objectStore(STORE_NAME).put(snapshot, 'latest');
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject('Save failed');
  });
}

export async function loadStateFromDB() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get('latest');
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject('Load failed');
  });
}

export async function clearStateFromDB() {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).delete('latest');
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve();
  });
}
