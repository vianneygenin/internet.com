// Sync initial au chargement de la page
(async () => {
  const extStored = await new Promise(resolve =>
    chrome.storage.local.get('bookmarks', d => resolve(d.bookmarks || null))
  );
  const localStored = JSON.parse(localStorage.getItem('bookmarks') || 'null');

  if (extStored && localStored) {
    const seen = new Set();
    const merged = [];
    [...extStored, ...localStored].forEach(bm => {
      const key = bm.url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (!seen.has(key)) { seen.add(key); merged.push(bm); }
    });
    localStorage.setItem('bookmarks', JSON.stringify(merged));
    chrome.storage.local.set({bookmarks: merged});
    window.postMessage({type: 'IC_UPDATE', bookmarks: merged}, '*');
  } else if (extStored) {
    localStorage.setItem('bookmarks', JSON.stringify(extStored));
    window.postMessage({type: 'IC_UPDATE', bookmarks: extStored}, '*');
  } else if (localStored) {
    chrome.storage.local.set({bookmarks: localStored});
  }
})();

// Extension modifiée (ex: depuis le popup) → met à jour la page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.bookmarks) return;
  const newVal = changes.bookmarks.newValue;
  localStorage.setItem('bookmarks', JSON.stringify(newVal));
  window.postMessage({type: 'IC_UPDATE', bookmarks: newVal}, '*');
});

// Page sauvegarde → sync vers l'extension
window.addEventListener('message', e => {
  if (e.source !== window || e.data?.type !== 'IC_SAVE') return;
  chrome.storage.local.set({bookmarks: e.data.bookmarks});
});
