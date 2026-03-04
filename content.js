// Sync initial au chargement de la page
(async () => {
  const [extBooks, extTheme] = await new Promise(resolve =>
    chrome.storage.local.get(['bookmarks', 'theme'], d => resolve([d.bookmarks || null, d.theme || null]))
  );
  const localStored = JSON.parse(localStorage.getItem('bookmarks') || 'null');

  if (extBooks && localStored) {
    const seen = new Set();
    const merged = [];
    [...extBooks, ...localStored].forEach(bm => {
      const key = bm.url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (!seen.has(key)) { seen.add(key); merged.push(bm); }
    });
    localStorage.setItem('bookmarks', JSON.stringify(merged));
    chrome.storage.local.set({bookmarks: merged});
    window.postMessage({type: 'IC_UPDATE', bookmarks: merged}, '*');
  } else if (extBooks) {
    localStorage.setItem('bookmarks', JSON.stringify(extBooks));
    window.postMessage({type: 'IC_UPDATE', bookmarks: extBooks}, '*');
  } else if (localStored) {
    chrome.storage.local.set({bookmarks: localStored});
  }

  const localTheme = localStorage.getItem('theme');
  if (extTheme && extTheme !== localTheme) {
    localStorage.setItem('theme', extTheme);
    window.postMessage({type: 'IC_UPDATE_THEME', theme: extTheme}, '*');
  } else if (localTheme && localTheme !== extTheme) {
    chrome.storage.local.set({theme: localTheme});
  }
})();

// Extension modifiée → met à jour la page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.bookmarks) {
    const newVal = changes.bookmarks.newValue;
    localStorage.setItem('bookmarks', JSON.stringify(newVal));
    window.postMessage({type: 'IC_UPDATE', bookmarks: newVal}, '*');
  }
  if (changes.theme) {
    const t = changes.theme.newValue;
    localStorage.setItem('theme', t);
    window.postMessage({type: 'IC_UPDATE_THEME', theme: t}, '*');
  }
});

// Page sauvegarde → sync vers l'extension
window.addEventListener('message', e => {
  if (e.source !== window) return;
  if (e.data?.type === 'IC_SAVE') chrome.storage.local.set({bookmarks: e.data.bookmarks});
  if (e.data?.type === 'IC_SAVE_THEME') chrome.storage.local.set({theme: e.data.theme});
});
