/**
 * 轻笔记 — Side Panel · Multi-page + Collapsible Sidebar
 */

// ═══════════════════════════════════════
// State
// ═══════════════════════════════════════
let pages = [];
let activeId = null;
let sidebarOpen = false;   // default: closed
let saveTimer = null;
let toastTimer = null;
let pendingDeleteId = null;
let searchTimer = null;
let currentTheme = 'auto';

// ═══════════════════════════════════════
// DOM
// ═══════════════════════════════════════
const appEl = document.getElementById('app');
const sidebarEl = document.getElementById('sidebar');
const pageListEl = document.getElementById('pageList');
const noteEditor = document.getElementById('noteEditor');
const noteEditorHidden = document.getElementById('noteEditorHidden');
const pageTitleInput = document.getElementById('pageTitleInput');
const charCountEl = document.getElementById('charCount');
const saveIndicator = document.getElementById('saveIndicator');
const saveText = document.getElementById('saveText');
const btnAddPage = document.getElementById('btnAddPage');
const btnCopy = document.getElementById('btnCopy');
const btnDeletePage = document.getElementById('btnDeletePage');
const btnSidebarToggle = document.getElementById('btnSidebarToggle');
const overlay = document.getElementById('overlay');
const btnCancel = document.getElementById('btnCancel');
const btnConfirm = document.getElementById('btnConfirm');
const toastEl = document.getElementById('toast');
const emptyState = document.getElementById('emptyState');
const ruledLines = document.getElementById('ruledLines');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const themeAuto = document.getElementById('themeAuto');
const themeLight = document.getElementById('themeLight');
const themeDark = document.getElementById('themeDark');

// ═══════════════════════════════════════
// Theme
// ═══════════════════════════════════════
function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  let effectiveTheme = theme;

  if (theme === 'auto') {
    effectiveTheme = getSystemTheme();
  }

  document.documentElement.setAttribute('data-theme', effectiveTheme);

  themeAuto.classList.toggle('active', theme === 'auto');
  themeLight.classList.toggle('active', theme === 'light');
  themeDark.classList.toggle('active', theme === 'dark');
}

async function setTheme(theme, save = true) {
  currentTheme = theme;
  applyTheme(theme);
  if (save) {
    await saveSettings('theme', theme);
  }
}

async function loadTheme() {
  const savedTheme = await loadSetting('theme', 'auto');
  currentTheme = savedTheme;
  applyTheme(savedTheme);
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (currentTheme === 'auto') {
    applyTheme('auto');
  }
});

// ═══════════════════════════════════════
// Sidebar toggle
// ═══════════════════════════════════════
async function setSidebarOpen(open, save = true) {
  sidebarOpen = open;
  sidebarEl.classList.toggle('collapsed', !open);
  appEl.classList.toggle('sidebar-open', open);
  btnSidebarToggle.title = open ? '收起页面列表' : '展开页面列表';
  if (save) await saveSettings('sidebarOpen', open);
}

function toggleSidebar() {
  setSidebarOpen(!sidebarOpen);
}

// ═══════════════════════════════════════
// Utils
// ═══════════════════════════════════════
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function clamp(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function getPage(id) {
  return pages.find(p => p.id === id) || null;
}

// ═══════════════════════════════════════
// IndexedDB Storage
// ═══════════════════════════════════════
const DB_NAME = 'quicknote';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('pages')) {
        db.createObjectStore('pages', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    };
  });
}

async function savePages() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pages', 'readwrite');
      const store = tx.objectStore('pages');
      
      const pageIds = new Set(pages.map(p => p.id));
      
      const getAllRequest = store.getAll();
      getAllRequest.onsuccess = () => {
        const existingPages = getAllRequest.result;
        
        let pending = pages.length + existingPages.length;
        
        if (pending === 0) {
          resolve(true);
          return;
        }
        
        existingPages.forEach(existing => {
          if (!pageIds.has(existing.id)) {
            const deleteReq = store.delete(existing.id);
            deleteReq.onsuccess = () => {
              pending--;
              if (pending === 0) {
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(tx.error);
              }
            };
            deleteReq.onerror = () => reject(deleteReq.error);
          } else {
            pending--;
            if (pending === 0) {
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => reject(tx.error);
            }
          }
        });
        
        pages.forEach(page => {
          const putReq = store.put(page);
          putReq.onsuccess = () => {
            pending--;
            if (pending === 0) {
              tx.oncomplete = () => resolve(true);
              tx.onerror = () => reject(tx.error);
            }
          };
          putReq.onerror = () => reject(putReq.error);
        });
      };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    });
  } catch (error) {
    console.error('Error saving pages:', error);
    return false;
  }
}

async function saveSettings(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put(value, key);
      request.onsuccess = () => {
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

async function loadPages() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pages', 'readonly');
      const store = tx.objectStore('pages');
      const request = store.getAll();
      request.onsuccess = () => {
        const allPages = request.result;
        resolve(allPages.length > 0 ? allPages : [createPage('笔记 1', '')]);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error loading pages:', error);
    return [createPage('笔记 1', '')];
  }
}

async function loadSetting(key, defaultValue) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);
      request.onsuccess = () => {
        const value = request.result;
        resolve(value !== undefined ? value : defaultValue);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error loading setting:', error);
    return defaultValue;
  }
}

// ═══════════════════════════════════════
// Storage
// ═══════════════════════════════════════
function persist() {
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const success = await savePages();
    await saveSettings('activeId', activeId);
    setSaveState(success ? 'saved' : 'unsaved');
  }, 280);
}

async function loadAll() {
  try {
    await loadTheme();

    pages = await loadPages();
    activeId = await loadSetting('activeId', pages[0].id);
    if (!getPage(activeId)) activeId = pages[0].id;

    const sidebarOpen = await loadSetting('sidebarOpen', false);
    setSidebarOpen(sidebarOpen, false);

    renderSidebar();
    switchTo(activeId, false);
    setSaveState('saved');
  } catch (error) {
    console.error('Error loading data:', error);
    await loadTheme();
    pages = [createPage('笔记 1', '')];
    activeId = pages[0].id;
    setSidebarOpen(false, false);
    renderSidebar();
    switchTo(activeId, false);
    setSaveState('saved');
  }
}

// ═══════════════════════════════════════
// Page CRUD
// ═══════════════════════════════════════
function createPage(title, content, color) {
  const now = Date.now();
  return { id: uid(), title: title || '', content: content || '', color: color || '#5C8E6B', createdAt: now, updatedAt: now };
}

function addPage() {
  const idx = pages.length + 1;
  const p = createPage(`笔记 ${idx}`, '');
  pages.push(p);
  activeId = p.id;
  renderSidebar();
  switchTo(p.id, false);
  // Auto-open sidebar when adding a page
  if (!sidebarOpen) setSidebarOpen(true);
  pageTitleInput.focus();
  pageTitleInput.select();
  persist();
}

function deletePage(id) {
  const idx = pages.findIndex(p => p.id === id);
  if (idx === -1) return;
  pages.splice(idx, 1);

  if (pages.length === 0) {
    activeId = null;
    renderSidebar();
    showEmptyState(true);
    persist();
    return;
  }

  const nextIdx = Math.min(idx, pages.length - 1);
  activeId = pages[nextIdx].id;
  renderSidebar();
  switchTo(activeId, false);
  persist();
}

function updateActiveContent() {
  const p = getPage(activeId);
  if (!p) return;
  p.content = htmlToMarkdown(noteEditor.innerHTML);
  p.updatedAt = Date.now();
  charCountEl.textContent = `${p.content.length} 字`;
  const item = pageListEl.querySelector(`[data-id="${activeId}"]`);
  if (item) {
    const prev = item.querySelector('.page-item-preview');
    if (prev) {
      const firstLine = (p.content).split('\n').find(l => l.trim()) || '';
      prev.textContent = clamp(firstLine, 28) || '暂无内容';
    }
  }
  persist();
}

function updateActiveTitle() {
  const p = getPage(activeId);
  if (!p) return;
  p.title = pageTitleInput.value;
  p.updatedAt = Date.now();
  const item = pageListEl.querySelector(`[data-id="${activeId}"]`);
  if (item) {
    const titleEl = item.querySelector('.page-item-title');
    if (titleEl) {
      titleEl.textContent = p.title || '无标题';
      titleEl.classList.toggle('empty-title-hint', !p.title);
    }
  }
  persist();
}

// ═══════════════════════════════════════
// Render sidebar
// ═════════════════════════════ĀĀ══════════
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function htmlToMarkdown(html) {
  const div = document.createElement('div');
  div.innerHTML = html;

  let markdown = '';

  div.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      markdown += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();

      if (tag === 'img') {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'image';
        markdown += `![${alt}](${src})`;
      } else if (tag === 'br') {
        markdown += '\n';
      } else if (tag === 'div' || tag === 'p') {
        markdown += htmlToMarkdown(node.innerHTML) + '\n';
      } else {
        markdown += node.textContent;
      }
    }
  });

  return markdown.trim();
}

function markdownToHtml(markdown) {
  let html = escapeHtml(markdown);

  const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  html = html.replace(imgRegex, (match, alt, src) => {
    return `<img src="${src}" alt="${alt}" />`;
  });

  html = html.replace(/\n/g, '<br>');

  return html;
}

function stripMarkdown(text) {
  let stripped = text;

  stripped = stripped.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');

  stripped = stripped.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  stripped = stripped.replace(/[#*_~`>]/g, '');

  stripped = stripped.replace(/```[\s\S]*?```/g, '');

  stripped = stripped.replace(/`[^`]+`/g, '');

  stripped = stripped.replace(/^\s*[-*+]\s+/gm, '');
  stripped = stripped.replace(/^\s*\d+\.\s+/gm, '');

  stripped = stripped.replace(/^\s*#+\s+/gm, '');

  return stripped.trim();
}

function getContextAroundMatch(text, query, maxLength = 28) {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return { text: text.substring(0, maxLength) || '暂无内容', highlightNeeded: false };
  }

  const contextBefore = 8;
  const contextAfter = 20;

  let start = Math.max(0, matchIndex - contextBefore);
  let end = Math.min(text.length, matchIndex + query.length + contextAfter);

  let excerpt = '';
  if (start > 0) excerpt += '…';
  excerpt += text.substring(start, end);
  if (end < text.length) excerpt += '…';

  return { text: excerpt, highlightNeeded: true };
}

function filterPages(query) {
  const items = pageListEl.querySelectorAll('.page-item');
  let visibleCount = 0;
  const lowerQuery = query.toLowerCase();

  items.forEach(item => {
    const id = item.dataset.id;
    const page = getPage(id);
    if (!page) return;

    const title = page.title || '';
    const content = page.content || '';
    const strippedContent = stripMarkdown(content);
    const lines = strippedContent.split('\n');
    const firstLine = lines.find(l => l.trim()) || '';

    const titleLower = title.toLowerCase();
    const strippedContentLower = strippedContent.toLowerCase();
    const titleMatchIdx = titleLower.indexOf(lowerQuery);
    const contentMatchIdx = strippedContentLower.indexOf(lowerQuery);

    const titleMatched = titleMatchIdx !== -1;
    const contentMatched = contentMatchIdx !== -1;

    if (!query || titleMatched || contentMatched) {
      item.style.display = '';
      visibleCount++;

      const titleEl = item.querySelector('.page-item-title');
      const previewEl = item.querySelector('.page-item-preview');

      if (query) {
        titleEl.innerHTML = highlightText(title || '无标题', query);

        let previewText = '';

        if (titleMatched) {
          previewText = getContextAroundMatch(title, query, 28).text;
        } else if (contentMatched) {
          previewText = getContextAroundMatch(strippedContent, query, 28).text;
        }

        previewEl.innerHTML = highlightText(previewText, query);
      } else {
        titleEl.textContent = title || '无标题';
        previewEl.textContent = clamp(firstLine, 28) || '暂无内容';
      }
    } else {
      item.style.display = 'none';
    }
  });

  if (query && visibleCount === 0) {
    showToast('未找到匹配的笔记');
  }
}

function renderSidebar() {
  pageListEl.innerHTML = '';
  const hasPagesFlag = pages.length > 0;
  btnSidebarToggle.classList.toggle('has-pages', hasPagesFlag);

  // 当只有一个页面时，禁用顶部删除按钮
  btnDeletePage.disabled = pages.length <= 1;

  pages.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'page-item' + (p.id === activeId ? ' active' : '');
    item.dataset.id = p.id;

    // 设置页面左侧色块颜色
    if (p.color) {
      item.style.setProperty('--page-color', p.color);
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'page-item-title' + (p.title ? '' : ' empty-title-hint');
    titleEl.textContent = p.title || '无标题';
    titleEl.title = p.title || '无标题';

    const previewEl = document.createElement('div');
    previewEl.className = 'page-item-preview';
    const firstLine = (p.content || '').split('\n').find(l => l.trim()) || '';
    previewEl.textContent = clamp(firstLine, 28) || '暂无内容';

    const colorBlock = document.createElement('div');
    colorBlock.className = 'page-item-color-block';
    colorBlock.title = '更改颜色';
    colorBlock.addEventListener('click', (e) => {
      e.stopPropagation();
      showColorPicker(p.id, colorBlock);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'page-item-delete' + (pages.length <= 1 ? ' disabled' : '');
    delBtn.title = pages.length <= 1 ? '至少需要保留一个页面' : '删除此页';
    delBtn.disabled = pages.length <= 1;
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 3h8M4.5 3V2.4A.4.4 0 014.9 2h2.2a.4.4 0 01.4.4V3M9.5 3l-.5 6.3A.9.9 0 018.1 10H3.9A.9.9 0 013 9.3L2.5 3"
        stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pages.length <= 1) return;
      pendingDeleteId = p.id;
      const pg = getPage(p.id);
      document.getElementById('confirmTitle').textContent =
        `删除「${pg.title || '无标题'}」？`;
      overlay.hidden = false;
    });

    item.appendChild(titleEl);
    item.appendChild(previewEl);
    item.appendChild(colorBlock);
    item.appendChild(delBtn);
    item.addEventListener('click', () => {
      if (activeId !== p.id) switchTo(p.id, true);
    });

    pageListEl.appendChild(item);
  });

  const activeEl = pageListEl.querySelector('.page-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

// ═══════════════════════════════════════
// Switch page
// ═══════════════════════════════════════
function switchTo(id, saveCurrent) {
  if (saveCurrent && activeId) {
    const prev = getPage(activeId);
    if (prev) prev.content = htmlToMarkdown(noteEditor.innerHTML);
  }

  activeId = id;
  const p = getPage(id);
  if (!p) return;

  pageListEl.querySelectorAll('.page-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  showEmptyState(false);
  pageTitleInput.value = p.title;
  noteEditor.innerHTML = markdownToHtml(p.content);
  charCountEl.textContent = `${p.content.length} 字`;
  noteEditor.focus();

  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(noteEditor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  if (p.content.length > 0) noteEditor.scrollTop = noteEditor.scrollHeight;
}

// ═══════════════════════════════════════
// Empty state
// ═══════════════════════════════════════
function showEmptyState(show) {
  emptyState.hidden = !show;
  noteEditor.style.display = show ? 'none' : '';
  document.querySelector('.paper-margin').style.display = show ? 'none' : '';
  ruledLines.style.display = show ? 'none' : '';
  pageTitleInput.disabled = show;
  if (show) {
    btnDeletePage.disabled = true;
    btnCopy.disabled = true;
  } else {
    // 当有页面时，根据页面数量决定是否禁用删除按钮
    btnDeletePage.disabled = pages.length <= 1;
    btnCopy.disabled = false;
  }
}

// ═══════════════════════════════════════
// Save state UI
// ═══════════════════════════════════════
function setSaveState(state) {
  saveIndicator.className = 'save-indicator ' + state;
  saveText.textContent = { saved: '已保存', saving: '保存中…', unsaved: '未保存' }[state] || '已保存';
}

// ═══════════════════════════════════════
// Ruled lines
// ═══════════════════════════════════════
function buildRuledLines() {
  ruledLines.innerHTML = '';
  const lineH = 30;
  const topOff = 6 + lineH;
  const n = Math.ceil(window.innerHeight / lineH) + 4;
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div');
    d.className = 'ruled-line';
    d.style.top = (topOff + i * lineH) + 'px';
    ruledLines.appendChild(d);
  }
}

// ═══════════════════════════════════════
// Toast
// ═══════════════════════════════════════
function showToast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// 颜色选择器
function showColorPicker(pageId, colorBlock) {
  const colors = [
    '#5C8E6B',
    '#C0524A',
    '#E0A020',
    '#4A6FA5',
    '#9C6644',
    '#6B46C1',
    '#2D3748',
    '#718096'
  ];

  const existingPicker = document.querySelector('.color-picker');
  if (existingPicker) existingPicker.remove();

  const colorPicker = document.createElement('div');
  colorPicker.className = 'color-picker';

  const page = getPage(pageId);
  const currentColor = page?.color || '#5C8E6B';

  colors.forEach(color => {
    const colorOption = document.createElement('button');
    colorOption.className = 'color-option' + (color === currentColor ? ' selected' : '');
    colorOption.style.backgroundColor = color;
    colorOption.title = color;
    colorOption.addEventListener('click', () => {
      if (page) {
        page.color = color;
        page.updatedAt = Date.now();
        renderSidebar();
        persist();
      }
      colorPicker.remove();
    });
    colorPicker.appendChild(colorOption);
  });

  const rect = colorBlock.getBoundingClientRect();
  colorPicker.style.left = `${rect.right + 8}px`;
  colorPicker.style.top = `${rect.top}px`;

  document.body.appendChild(colorPicker);

  setTimeout(() => {
    document.addEventListener('click', function closeColorPicker(e) {
      if (!colorPicker.contains(e.target) && e.target !== colorBlock) {
        colorPicker.remove();
        document.removeEventListener('click', closeColorPicker);
      }
    });
  }, 100);
}

// ═══════════════════════════════════════
// Copy
// ═══════════════════════════════════════
async function copyContent() {
  const text = htmlToMarkdown(noteEditor.innerHTML);
  if (!text.trim()) { showToast('笔记内容为空'); return; }
  try { await navigator.clipboard.writeText(text); }
  catch { noteEditor.select(); document.execCommand('copy'); }
  showToast('✓ 已复制到剪贴板');
  btnCopy.style.cssText = 'background:var(--sage-ultra);border-color:var(--sage-light);color:var(--sage)';
  setTimeout(() => btnCopy.style.cssText = '', 700);
}

// ═══════════════════════════════════════
// Events
// ═══════════════════════════════════════
btnSidebarToggle.addEventListener('click', toggleSidebar);
btnAddPage.addEventListener('click', addPage);

themeAuto.addEventListener('click', async () => await setTheme('auto'));
themeLight.addEventListener('click', async () => await setTheme('light'));
themeDark.addEventListener('click', async () => await setTheme('dark'));

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim().toLowerCase();
  searchClear.hidden = !query;

  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    filterPages(query);
  }, 500);
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.hidden = true;
  filterPages('');
  searchInput.focus();
});

noteEditor.addEventListener('input', updateActiveContent);

noteEditor.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();

      const file = item.getAsFile();
      if (!file) continue;

      try {
        const base64 = await fileToBase64(file);

        const img = document.createElement('img');
        img.src = base64;
        img.alt = 'image';

        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(img);
          range.collapse(false);
        } else {
          noteEditor.appendChild(img);
        }

        noteEditor.focus();
        updateActiveContent();
        showToast('图片已插入');
      } catch (error) {
        console.error('Image paste error:', error);
        showToast('图片插入失败');
      }
      return;
    }
  }
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

pageTitleInput.addEventListener('input', updateActiveTitle);
pageTitleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { noteEditor.focus(); e.preventDefault(); }
});

btnCopy.addEventListener('click', copyContent);

btnDeletePage.addEventListener('click', () => {
  if (!activeId || pages.length <= 1) return;
  pendingDeleteId = activeId;
  const p = getPage(activeId);
  document.getElementById('confirmTitle').textContent =
    `删除「${p?.title || '无标题'}」？`;
  overlay.hidden = false;
});

btnCancel.addEventListener('click', () => {
  overlay.hidden = true;
  pendingDeleteId = null;
});

btnConfirm.addEventListener('click', () => {
  if (pendingDeleteId) {
    deletePage(pendingDeleteId);
    overlay.hidden = true;
    pendingDeleteId = null;
    showToast('页面已删除');
  }
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) { overlay.hidden = true; pendingDeleteId = null; }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overlay.hidden) {
    overlay.hidden = true;
    pendingDeleteId = null;
    e.preventDefault();
  }
});

window.addEventListener('resize', buildRuledLines);

// ═══════════════════════════════════════
// Init
// ═══════════════════════════════════════
buildRuledLines();
loadAll();
