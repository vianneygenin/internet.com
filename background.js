function cleanUrl(url) { return url.trim().replace(/\/+$/, ''); }

async function setIcon() {
  const { theme = 'dark' } = await chrome.storage.local.get('theme');
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = theme === 'light' ? '#111' : '#eee';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  chrome.action.setIcon({ imageData: ctx.getImageData(0, 0, size, size) });
}

chrome.runtime.onInstalled.addListener(setIcon);
chrome.runtime.onStartup.addListener(setIcon);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.theme) setIcon();
});
setIcon();

chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url;
  if (!url || /^(chrome|chrome-extension|about|edge):/.test(url)) return;

  const clean = cleanUrl(url);
  const { bookmarks = [] } = await chrome.storage.local.get('bookmarks');
  const norm = u => (u.startsWith('http') ? u : 'https://' + u).replace(/\/+$/, '');
  const exists = bookmarks.some(b => norm(b.url) === norm(clean));

  if (!exists) {
    bookmarks.push({ id: Date.now(), url: clean });
    await chrome.storage.local.set({ bookmarks });
  }

  chrome.action.setBadgeText({ text: exists ? '·' : '+', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#444', tabId: tab.id });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 1500);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'open-popup') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.url || /^(chrome|chrome-extension|about|edge):/.test(tab.url)) return;

  const clean = cleanUrl(tab.url);
  const { bookmarks = [] } = await chrome.storage.local.get('bookmarks');
  const norm = u => (u.startsWith('http') ? u : 'https://' + u).replace(/\/+$/, '');
  const exists = bookmarks.some(b => norm(b.url) === norm(clean));

  if (!exists) {
    bookmarks.push({ id: Date.now(), url: clean });
    await chrome.storage.local.set({ bookmarks });
  }

  chrome.action.setBadgeText({ text: exists ? '·' : '+', tabId: tab.id });
  chrome.action.setBadgeBackgroundColor({ color: '#444', tabId: tab.id });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id }), 1500);
});
