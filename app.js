const IS_EXT = typeof chrome !== 'undefined' && !!chrome?.storage?.local;
if (IS_EXT) document.body.classList.add('ext');

const DEFAULTS = [
  { id: 1, url: 'autocatalogarchive.com', title: 'Auto Catalog Archive', desc: 'Car catalog archive automobile vehicles models' },
  { id: 2, url: 'fmhy.net', title: 'FMHY', desc: 'Free media resources tools links' },
  { id: 3, url: 'emojipedia.org', title: 'Emojipedia', desc: 'Emoji reference meanings symbols' },
  { id: 4, url: 'www.imcdb.org', title: 'Internet Movie Cars Database', desc: 'Cars vehicles automobiles in movies films voiture cinema' },
  { id: 5, url: 'www.iloveimg.com', title: 'iLoveIMG', desc: 'Edit compress resize images photos pictures' },
  { id: 6, url: 'www.ilovepdf.com/fr', title: 'iLovePDF', desc: 'PDF tools convert compress merge split documents' },
];

function setStorage(key, value) {
  if (IS_EXT) {
    chrome.storage.local.set({[key]: value});
  } else {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    if (key === 'bookmarks') window.postMessage({type: 'IC_SAVE', bookmarks: value}, '*');
    if (key === 'theme') window.postMessage({type: 'IC_SAVE_THEME', theme: value}, '*');
  }
}

async function getStorage(key) {
  if (IS_EXT) {
    return new Promise(resolve => chrome.storage.local.get(key, d => resolve(d[key] ?? null)));
  }
  const v = localStorage.getItem(key);
  try { return v ? JSON.parse(v) : null; } catch { return v; }
}

let bookmarks = [];
let undoStack = [];
let query = '';
let activeTag = null;
let sortMode = 0;
let sortAngle = 90;
let hoveredId = null, hoveredLi = null;
let selected = new Set();
let dragging = false, dragStart = null;

const list = document.getElementById('bookmark-list');
const search = document.getElementById('search');
const addBtn = document.getElementById('add-btn');
const tagFilters = document.getElementById('tag-filters');
const dragRect = document.getElementById('drag-rect');
const toggle = document.getElementById('theme-toggle');
const sortBtn = document.getElementById('sort-btn');
const faviconEl = document.getElementById('favicon');

const faviconDark  = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48Y2lyY2xlIGN4PSc1MCcgY3k9JzUwJyByPSc0MCcgZmlsbD0nbm9uZScgc3Ryb2tlPScjZmZmJyBzdHJva2Utd2lkdGg9JzEwJy8+PC9zdmc+';
const faviconLight = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAxMDAgMTAwJz48Y2lyY2xlIGN4PSc1MCcgY3k9JzUwJyByPSc0MCcgZmlsbD0nbm9uZScgc3Ryb2tlPScjMDAwJyBzdHJva2Utd2lkdGg9JzEwJy8+PC9zdmc+';

function updateExtIcon() {
  if (!IS_EXT || !chrome.action?.setIcon) return;
  const size = 32;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const isLight = document.body.classList.contains('light');
  ctx.strokeStyle = isLight ? '#111' : '#eee';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  chrome.action.setIcon({imageData: ctx.getImageData(0, 0, size, size)});
}

const applyTheme = t => {
  document.body.classList.toggle('light', t === 'light');
  faviconEl.href = t === 'light' ? faviconLight : faviconDark;
  updateExtIcon();
};

const save = () => setStorage('bookmarks', bookmarks);
const pushUndo = () => { undoStack.push([...bookmarks]); if (undoStack.length > 20) undoStack.shift(); };

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cleanUrl(url) {
  url = url.trim();
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  }
}
function href(url) { return url.startsWith('http') ? url : 'https://' + url; }

async function fetchMeta(url) {
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(href(url))}`);
    const json = await res.json();
    if (json.status === 'success') {
      const d = json.data;
      return { title: d.title || '', desc: d.description || '', tag: guessTag(url, d) };
    }
  } catch {}
  return {};
}

function guessTag(url, data) {
  const text = (url + ' ' + (data.title || '') + ' ' + (data.description || '')).toLowerCase();
  if (/openai|anthropic|claude|chatgpt|gemini|mistral|llm|gpt|midjourney|stable diffusion|huggingface|ollama|perplexity/.test(text)) return 'ai';
  if (/anime|manga|crunchyroll|anilist|myanimelist|webtoon/.test(text)) return 'anime';
  if (/archive|wayback|catalog archive|autocatalog/.test(text)) return 'archive';
  if (/medium|substack|newsletter|article|write\.as|ghost\.io/.test(text)) return 'blog';
  if (/goodreads|ebook|kindle|gutenberg|livre|book|read|lire/.test(text)) return 'books';
  if (/imcdb|car catalog|voiture|automobile|automotive|vehicle|motorsport|supercars|topgear|carsandbids|bringatrailer/.test(text)) return 'cars';
  if (/color|colour|palette|hex|coolors|paletton|colorhunt/.test(text)) return 'color';
  if (/crypto|bitcoin|ethereum|blockchain|nft|defi|coinmarketcap/.test(text)) return 'crypto';
  if (/github|gitlab|stackoverflow|codepen|npm|vercel|netlify|dev\.to|replit|raycast|cursor|vscode|devdocs/.test(text)) return 'dev';
  if (/figma|dribbble|behance|awwwards|design|ui kit|ux|branding/.test(text)) return 'design';
  if (/emoji|emojipedia/.test(text)) return 'emoji';
  if (/finance|invest|stock|bourse|trading|bank|etf|portfolio/.test(text)) return 'finance';
  if (/movix|letterboxd|netflix|allocin|imdb|film|movie|cinema|series|trailer/.test(text)) return 'film';
  if (/food|recette|cuisine|restaurant|cook|recipe|marmiton/.test(text)) return 'food';
  if (/dafont|fontsquirrel|google fonts|font|typeface|typography/.test(text)) return 'fonts';
  if (/game|gaming|steam|itch\.io|playstation|xbox|nintendo|esport|twitch/.test(text)) return 'games';
  if (/hardware|cpu|gpu|raspberry|arduino|benchmark|pcpartpicker/.test(text)) return 'hardware';
  if (/health|fitness|workout|exercise|meditation|nutrition|santé/.test(text)) return 'health';
  if (/heroicons|flaticon|iconify|noun project|icon|svg icons/.test(text)) return 'icons';
  if (/learn|course|tutorial|udemy|coursera|education|formation|skillshare|khan/.test(text)) return 'learn';
  if (/google maps|openstreetmap|geograph|map|cartograph/.test(text)) return 'maps';
  if (/spotify|soundcloud|deezer|bandcamp|whosampled|sampled|music|song|album|artist|playlist/.test(text)) return 'music';
  if (/hacker news|lobste|techcrunch|theverge|wired|arstechnica|news/.test(text)) return 'news';
  if (/photo|photography|unsplash|pexels|pixabay|flickr|lightroom|camera/.test(text)) return 'photo';
  if (/podcast|episode|overcast|spotify podcast/.test(text)) return 'podcast';
  if (/productivity|notion|obsidian|todo|task|calendar|planning|roam/.test(text)) return 'productivity';
  if (/docs|documentation|reference|mdn|wiki|manual|spec/.test(text)) return 'ref';
  if (/science|research|paper|study|nasa|physics|biology|arxiv/.test(text)) return 'science';
  if (/security|hack|pentest|cyber|vulnerability|ctf|exploit/.test(text)) return 'security';
  if (/amazon|ebay|etsy|shop|store|buy|boutique|market/.test(text)) return 'shopping';
  if (/reddit|twitter|x\.com|instagram|tiktok|linkedin|mastodon|bluesky/.test(text)) return 'social';
  if (/sport|football|basket|tennis|nba|nfl|fifa|score/.test(text)) return 'sport';
  if (/convert|compress|resize|ilovepdf|iloveimg|calc|pdf|merge|split/.test(text)) return 'tools';
  if (/travel|voyage|hotel|flight|airbnb|booking/.test(text)) return 'travel';
  if (/youtube|vimeo|dailymotion|streaming|video/.test(text)) return 'video';
  if (/3d|blender|maya|cinema4d|sketchfab|cad/.test(text)) return '3d';
  return null;
}

function copyBM(id, li) {
  const b = bookmarks.find(x => x.id === id);
  if (!b) return;
  navigator.clipboard.writeText(href(b.url));
  const btn = li.querySelector('.btn-copy');
  btn.classList.remove('copied');
  void btn.offsetWidth;
  btn.classList.add('copied');
  btn.addEventListener('animationend', () => btn.classList.remove('copied'), { once: true });
}

function renderTags() {
  const tags = [...new Set(bookmarks.map(b => b.tag).filter(Boolean))].sort();
  tagFilters.innerHTML = '';
  const all = document.createElement('button');
  all.className = 'tag-btn' + (!activeTag ? ' active' : '');
  all.textContent = 'all';
  all.onclick = () => { activeTag = null; renderTags(); render(); };
  tagFilters.appendChild(all);
  tags.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tag-btn' + (activeTag === t ? ' active' : '');
    btn.textContent = t;
    btn.onclick = () => { activeTag = activeTag === t ? null : t; renderTags(); render(); };
    tagFilters.appendChild(btn);
  });
}

function render() {
  const q = query.toLowerCase();
  const filtered = bookmarks.filter(b => {
    const matchTag = !activeTag || b.tag === activeTag;
    const matchQ = !q || [b.url, b.tag, b.title, b.desc].filter(Boolean).some(v => v.toLowerCase().includes(q));
    return matchTag && matchQ;
  });
  const disp = url => cleanUrl(url).replace(/^(https?:\/\/)?(www\.)?/, '');
  if (sortMode === 1) filtered.sort((a, b) => disp(a.url).length - disp(b.url).length);
  else if (sortMode === 2) filtered.sort((a, b) => b.id - a.id);
  else if (sortMode === 3) filtered.sort((a, b) => disp(a.url).localeCompare(disp(b.url)));

  list.innerHTML = '';

  if (!filtered.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'aucun résultat';
    list.appendChild(li);
    return;
  }

  filtered.forEach(b => {
    const li = document.createElement('li');
    li.className = 'bookmark-item';
    li.dataset.id = b.id;
    li.innerHTML = `
      <span class="item-text">
        <span class="item-url">${esc(cleanUrl(b.url).replace(/^(https?:\/\/)?(www\.)?/, ''))}</span>
      </span>
      <span class="item-actions">
        <button class="btn-copy" data-id="${b.id}">c</button>
        <button class="btn-edit" data-id="${b.id}">e</button>
        <button class="btn-del" data-id="${b.id}">x</button>
      </span>
    `;
    li.querySelector('.item-url').onclick = () => window.open(href(b.url), '_blank');
    li.querySelector('.btn-copy').onclick = e => { e.stopPropagation(); copyBM(b.id, li); };
    li.querySelector('.btn-edit').onclick = e => { e.stopPropagation(); startEdit(b.id, li); };
    li.querySelector('.btn-del').onclick = e => { e.stopPropagation(); deleteBM(b.id); };
    li.addEventListener('mouseenter', () => { hoveredId = b.id; hoveredLi = li; });
    li.addEventListener('mouseleave', () => { hoveredId = null; hoveredLi = null; });
    list.appendChild(li);
  });
}

function startEdit(id, li) {
  const b = bookmarks.find(x => x.id === id);
  if (!b) return;
  const form = document.createElement('div');
  form.className = 'inline-form';
  form.innerHTML = `
    <input class="f-url" value="${esc(b.url)}" placeholder="url">
    <input class="f-tag" value="${esc(b.tag || '')}" placeholder="tag">
  `;
  const saveEdit = () => {
    b.url = cleanUrl(form.querySelector('.f-url').value);
    b.tag = form.querySelector('.f-tag').value.trim();
    if (!b.url) return;
    save(); renderTags(); render();
  };
  form.querySelectorAll('input').forEach(inp => {
    inp.onkeydown = e => {
      if (e.key === 'Enter') saveEdit();
      if (e.key === 'Escape') render();
    };
  });
  li.replaceWith(form);
  const inp = form.querySelector('.f-url');
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
}

function deleteBM(id) {
  pushUndo();
  bookmarks = bookmarks.filter(b => b.id !== id);
  save(); renderTags(); render();
}

async function addUrl(url) {
  const id = Date.now();
  const bm = { id, url };
  bookmarks.push(bm);
  save(); renderTags(); render();
  const meta = await fetchMeta(url);
  if (meta.title || meta.desc || meta.tag) {
    bm.title = meta.title;
    bm.desc = meta.desc;
    if (meta.tag) bm.tag = meta.tag;
    save(); renderTags(); render();
  }
}

function handlePasteUrl(url) {
  url = cleanUrl(url);
  if (!url) return;
  const existing = bookmarks.find(b => b.url === url || href(b.url) === url || b.url === url.replace(/^https?:\/\//, ''));
  if (existing) {
    const el = document.querySelector(`.bookmark-item[data-id="${existing.id}"]`);
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return;
  }
  addUrl(url);
}

addBtn.onclick = () => {
  if (IS_EXT && chrome.tabs) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, tabs => {
      if (tabs[0]) handlePasteUrl(tabs[0].url);
    });
    addBtn.blur();
    return;
  }
  const form = document.createElement('div');
  form.className = 'inline-form';
  form.innerHTML = `
    <input class="f-url" placeholder="url">
    <input class="f-tag" placeholder="tag">
  `;
  const saveAdd = async () => {
    const url = cleanUrl(form.querySelector('.f-url').value);
    const tag = form.querySelector('.f-tag').value.trim();
    if (!url) { form.querySelector('.f-url').focus(); return; }
    form.remove();
    const id = Date.now();
    const bm = { id, url, tag };
    bookmarks.push(bm);
    save(); renderTags(); render();
    const meta = await fetchMeta(url);
    if (meta.title || meta.desc || meta.tag) {
      bm.title = meta.title;
      bm.desc = meta.desc;
      if (!bm.tag && meta.tag) bm.tag = meta.tag;
      save(); renderTags(); render();
    }
  };
  form.querySelectorAll('input').forEach(inp => {
    inp.onkeydown = e => {
      if (e.key === 'Enter') saveAdd();
      if (e.key === 'Escape') form.remove();
    };
  });
  addBtn.before(form);
  form.querySelector('.f-url').focus();
};

search.oninput = () => { query = search.value; render(); };

function clearSelection() {
  selected.clear();
  document.querySelectorAll('.bookmark-item.selected').forEach(el => el.classList.remove('selected'));
}

document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  if (e.target.closest('button, input, .inline-form')) return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
  e.preventDefault();
  dragging = true;
  dragStart = { x: e.clientX, y: e.clientY };
  dragRect.style.display = 'none';
  if (!e.shiftKey) clearSelection();
});

document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
  const x = Math.min(e.clientX, dragStart.x);
  const y = Math.min(e.clientY, dragStart.y);
  const w = Math.abs(dx), h = Math.abs(dy);
  dragRect.style.display = 'block';
  dragRect.style.left = x + 'px';
  dragRect.style.top = y + 'px';
  dragRect.style.width = w + 'px';
  dragRect.style.height = h + 'px';
  document.querySelectorAll('.bookmark-item').forEach(el => {
    const r = el.getBoundingClientRect();
    const hit = r.left < x+w && r.right > x && r.top < y+h && r.bottom > y;
    const id = parseInt(el.dataset.id);
    if (hit) { el.classList.add('selected'); selected.add(id); }
    else if (!e.shiftKey) { el.classList.remove('selected'); selected.delete(id); }
  });
});

document.addEventListener('mouseup', () => {
  dragging = false;
  dragRect.style.display = 'none';
});

document.addEventListener('paste', e => {
  if (document.activeElement.tagName === 'INPUT') return;
  const url = (e.clipboardData || window.clipboardData).getData('text');
  handlePasteUrl(url);
});

document.addEventListener('keydown', e => {
  if (document.activeElement.tagName === 'INPUT') return;
  if (e.key === 'Escape' && IS_EXT) { window.close(); return; }
  const key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && key === 'z') {
    if (undoStack.length) { bookmarks = undoStack.pop(); save(); renderTags(); render(); }
    return;
  }
  if ((e.metaKey || e.ctrlKey) && key === 'v') {
    navigator.clipboard.readText().then(handlePasteUrl).catch(() => {});
    return;
  }
  if (hoveredId && hoveredLi) {
    if (key === 'x') { deleteBM(hoveredId); return; }
    if (key === 'c') { copyBM(hoveredId, hoveredLi); return; }
    if (key === 'e') { e.preventDefault(); const li = hoveredLi; startEdit(hoveredId, li); return; }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
    pushUndo();
    bookmarks = bookmarks.filter(b => !selected.has(b.id));
    selected.clear();
    save(); renderTags(); render();
  }
});

toggle.onclick = () => {
  const t = document.body.classList.contains('light') ? 'dark' : 'light';
  setStorage('theme', t);
  applyTheme(t);
};

const updateSortBtn = () => { sortBtn.style.transform = `rotate(${sortAngle}deg)`; };
updateSortBtn();
sortBtn.onclick = () => {
  sortAngle += 90;
  sortMode = (sortMode + 1) % 4;
  updateSortBtn();
  render();
};

// Sync: reçoit les updates du content script (web uniquement)
if (!IS_EXT) {
  window.addEventListener('message', e => {
    if (e.source !== window) return;
    if (e.data?.type === 'IC_UPDATE') { bookmarks = e.data.bookmarks; renderTags(); render(); }
    if (e.data?.type === 'IC_UPDATE_THEME') applyTheme(e.data.theme);
  });
}

// Init async
(async () => {
  const OLD_URLS = ['github.com', 'mdn.dev', 'lobste.rs'];
  let stored = await getStorage('bookmarks');
  const isOldData = stored && stored.every(b => OLD_URLS.includes(b.url));
  if (isOldData) stored = null;
  bookmarks = stored ?? [...DEFAULTS];

  bookmarks.forEach(b => {
    if (!b.title && !b.desc) {
      const def = DEFAULTS.find(d => d.url === b.url);
      if (def) { b.title = def.title; b.desc = def.desc; }
    }
  });

  let tagsChanged = false;
  bookmarks.forEach(b => {
    const t = guessTag(b.url, { title: b.title, description: b.desc });
    if (t && t !== b.tag) { b.tag = t; tagsChanged = true; }
  });
  if (tagsChanged) save();

  const savedTheme = await getStorage('theme');
  applyTheme(savedTheme || 'dark');

  if (IS_EXT) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.bookmarks) { bookmarks = changes.bookmarks.newValue; renderTags(); render(); }
      if (changes.theme) applyTheme(changes.theme.newValue);
    });
  }

  updateExtIcon();

  renderTags();
  render();

  const toFetch = bookmarks.filter(b => !b.title && !b.desc);
  if (toFetch.length) {
    Promise.all(toFetch.map(async b => {
      const meta = await fetchMeta(b.url);
      if (meta.title || meta.desc || meta.tag) {
        b.title = meta.title;
        b.desc = meta.desc;
        if (!b.tag && meta.tag) b.tag = meta.tag;
        return true;
      }
      return false;
    })).then(results => {
      if (results.some(Boolean)) { save(); renderTags(); render(); }
    });
  }
})();
