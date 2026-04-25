/**
 * 轻笔记 — Side Panel · Multi-page + Collapsible Sidebar
 */

// ═══════════════════════════════════════
// State
// ═══════════════════════════════════════
let pages        = [];
let activeId     = null;
let sidebarOpen  = false;   // default: closed
let saveTimer    = null;
let toastTimer   = null;
let pendingDeleteId = null;

// ═══════════════════════════════════════
// DOM
// ═══════════════════════════════════════
const appEl           = document.getElementById('app');
const sidebarEl       = document.getElementById('sidebar');
const pageListEl      = document.getElementById('pageList');
const noteEditor      = document.getElementById('noteEditor');
const pageTitleInput  = document.getElementById('pageTitleInput');
const charCountEl     = document.getElementById('charCount');
const saveIndicator   = document.getElementById('saveIndicator');
const saveText        = document.getElementById('saveText');
const btnAddPage      = document.getElementById('btnAddPage');
const btnCopy         = document.getElementById('btnCopy');
const btnDeletePage   = document.getElementById('btnDeletePage');
const btnSidebarToggle = document.getElementById('btnSidebarToggle');
const overlay         = document.getElementById('overlay');
const btnCancel       = document.getElementById('btnCancel');
const btnConfirm      = document.getElementById('btnConfirm');
const toastEl         = document.getElementById('toast');
const emptyState      = document.getElementById('emptyState');
const ruledLines      = document.getElementById('ruledLines');

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
    const tx = db.transaction('pages', 'readwrite');
    const store = tx.objectStore('pages');
    
    for (const page of pages) {
      await store.put(page);
    }
    
    await tx.complete;
    return true;
  } catch (error) {
    console.error('Error saving pages:', error);
    return false;
  }
}

async function saveSettings(key, value) {
  try {
    const db = await openDB();
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    
    await store.put(value, key);
    await tx.complete;
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

async function loadPages() {
  try {
    const db = await openDB();
    const tx = db.transaction('pages', 'readonly');
    const store = tx.objectStore('pages');
    const allPages = await store.getAll();
    
    return allPages.length > 0 ? allPages : [createPage('笔记 1', '')];
  } catch (error) {
    console.error('Error loading pages:', error);
    return [createPage('笔记 1', '')];
  }
}

async function loadSetting(key, defaultValue) {
  try {
    const db = await openDB();
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const value = await store.get(key);
    
    return value !== undefined ? value : defaultValue;
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
    // 检查是否需要从 chrome.storage.local 迁移
    const migrationNeeded = await checkMigrationNeeded();
    if (migrationNeeded) {
      await migrateFromChromeStorage();
    }
    
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
    // 降级到默认数据
    pages = [createPage('笔记 1', '')];
    activeId = pages[0].id;
    setSidebarOpen(false, false);
    renderSidebar();
    switchTo(activeId, false);
    setSaveState('saved');
  }
}

// 迁移相关函数
async function checkMigrationNeeded() {
  try {
    const db = await openDB();
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const migrated = await store.get('migrated');
    return migrated !== true;
  } catch (error) {
    return true;
  }
}

async function migrateFromChromeStorage() {
  try {
    return new Promise((resolve) => {
      chrome.storage.local.get(['pages', 'activeId', 'sidebarOpen'], async (result) => {
        if (result.pages) {
          pages = result.pages;
          await savePages();
        }
        if (result.activeId) {
          activeId = result.activeId;
          await saveSettings('activeId', activeId);
        }
        if (result.sidebarOpen !== undefined) {
          await saveSettings('sidebarOpen', result.sidebarOpen);
        }
        
        // 标记迁移完成
        await saveSettings('migrated', true);
        resolve();
      });
    });
  } catch (error) {
    console.error('Migration error:', error);
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
  p.content = noteEditor.value;
  p.updatedAt = Date.now();
  charCountEl.textContent = `${p.content.length} 字`;
  // Refresh sidebar preview
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
// ═══════════════════════════════════════
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
    if (prev) prev.content = noteEditor.value;
  }

  activeId = id;
  const p = getPage(id);
  if (!p) return;

  pageListEl.querySelectorAll('.page-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  showEmptyState(false);
  pageTitleInput.value = p.title;
  noteEditor.value = p.content;
  charCountEl.textContent = `${p.content.length} 字`;
  noteEditor.focus();
  noteEditor.setSelectionRange(p.content.length, p.content.length);
  if (p.content.length > 0) noteEditor.scrollTop = noteEditor.scrollHeight;
}

// ═══════════════════════════════════════
// Empty state
// ═══════════════════════════════════════
function showEmptyState(show) {
  emptyState.hidden = !show;
  noteEditor.style.display     = show ? 'none' : '';
  document.querySelector('.paper-margin').style.display = show ? 'none' : '';
  ruledLines.style.display     = show ? 'none' : '';
  pageTitleInput.disabled      = show;
  if (show) {
    btnDeletePage.disabled       = true;
    btnCopy.disabled             = true;
  } else {
    // 当有页面时，根据页面数量决定是否禁用删除按钮
    btnDeletePage.disabled       = pages.length <= 1;
    btnCopy.disabled             = false;
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
  const lineH  = 30;
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
  const text = noteEditor.value;
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

noteEditor.addEventListener('input', updateActiveContent);
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
