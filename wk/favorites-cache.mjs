// Only the public, all-country song list is shared across rooms and visits.
const countries = ['ko','th','fil','vi','ne','mn','id','lo','my','zh-CN','ja','und'];
const sources = [
  'https://raw.githubusercontent.com/cyberkjh36/neutinamu-song-search/main/data/favorites/all.json',
  '../data/favorites/all.json'
];
const key = 'all';
const revision = snapshot => Date.parse(snapshot?.updatedAt) || 0;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

function parseSnapshot(data) {
  if (data?.format !== 'WorldKaraoke.CloudFavorites' || data.version !== 1 ||
      !Array.isArray(data.countries) || data.countries.length !== countries.length ||
      !countries.every(c => data.countries.includes(c)) || !Array.isArray(data.rows) ||
      data.rows.length > 50000 || !(validTime(data.updatedAt) || (data.updatedAt === null && !data.rows.length))) {
    throw Error('Invalid favorites snapshot');
  }
  const seen = new Set();
  const rows = data.rows.map(({country, id, title, count, lastPlayed}) => {
    const identity = country + ':' + id;
    if (!countries.includes(country) || typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id) ||
        seen.has(identity) || typeof title !== 'string' || !title.trim() || title.length > 500 ||
        !Number.isSafeInteger(count) || count < 1 || !validTime(lastPlayed)) throw Error('Invalid favorite');
    seen.add(identity);
    return {country, id, title, count, lastPlayed};
  });
  return {format:data.format, version:1, updatedAt:data.updatedAt, countries, rows};
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open('wk-shared-favorites-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Storage busy'));
  });
}

// Compare and replace inside one transaction, including when two tabs reconnect.
async function storedSnapshot(incoming) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', incoming ? 'readwrite' : 'readonly');
      const store = tx.objectStore('snapshots');
      const read = store.get(key);
      let result;
      read.onsuccess = () => {
        if (read.result) {
          try { result = parseSnapshot(read.result); } catch { /* recover on the next refresh */ }
        }
        if (incoming && (!result || revision(incoming) > revision(result))) {
          result = incoming;
          store.put(incoming, key);
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || Error('Storage unavailable'));
    });
  } finally { db.close(); }
}

const searchKey = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const byRank = (a,b) => b.count-a.count || (a.lastPlayed < b.lastPlayed ? 1 : a.lastPlayed > b.lastPlayed ? -1 : 0) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createFavoritesCache({onChange = () => {}, fetchList = (...args) => fetch(...args)} = {}) {
  let current, refreshing, saved = false;
  function accept(snapshot, persisted) {
    if (!snapshot || (current && revision(snapshot) < revision(current))) return;
    if (current && revision(snapshot) === revision(current) && (saved || !persisted)) return;
    current = snapshot;
    saved = persisted;
    onChange();
  }

  async function restore() {
    try { accept(await storedSnapshot(), true); } catch { /* browsing the PC still works */ }
  }

  async function download() {
    for (const source of sources) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetchList(source, {cache:'no-cache', credentials:'omit', signal:controller.signal});
        if (!response.ok) continue;
        const snapshot = parseSnapshot(await response.json());
        try { accept(await storedSnapshot(snapshot), true); }
        catch { accept(snapshot, false); }
        return;
      } catch { /* try the other public copy, keeping the last complete list */ }
      finally { clearTimeout(timer); }
    }
  }

  function refresh() {
    const task = download();
    refreshing = task;
    return task.finally(() => { if (refreshing === task) refreshing = undefined; });
  }

  function page(language, query, requestedPage) {
    const country = language === 'zh-CN' ? language : language.split('-')[0];
    const terms = query.trim().split(/\s+/u).map(searchKey).filter(Boolean);
    const matches = current.rows.filter(row => row.country === country &&
      (!terms.length || terms.every(term => searchKey(row.title).includes(term)))).sort(byRank);
    const page = Math.min(requestedPage, Math.max(0, Math.ceil(matches.length/20)-1));
    const items = matches.slice(page*20, (page+1)*20).map(row => ({
      id:row.id, title:row.title.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,200).replace(/[\uD800-\uDBFF]$/, '') || row.id,
      channel:String(row.count), duration:''
    }));
    return {catalog:{v:1, items, error:null}, page, more:(page+1)*20 < matches.length};
  }

  return {restore, refresh, page, get refreshing(){return refreshing;}, get snapshot(){return current;}, get saved(){return saved;}};
}
