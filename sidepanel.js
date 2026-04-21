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
function setSidebarOpen(open, save = true) {
  sidebarOpen = open;
  sidebarEl.classList.toggle('collapsed', !open);
  appEl.classList.toggle('sidebar-open', open);
  btnSidebarToggle.title = open ? '收起页面列表' : '展开页面列表';
  if (save) chrome.storage.local.set({ sidebarOpen: open });
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
// Storage
// ═══════════════════════════════════════
function persist() {
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ pages, activeId }, () => {
      setSaveState(chrome.runtime.lastError ? 'unsaved' : 'saved');
    });
  }, 280);
}

function loadAll() {
  chrome.storage.local.get(['pages', 'activeId', 'sidebarOpen'], (result) => {
    // Restore pages
    pages = Array.isArray(result.pages) && result.pages.length > 0
      ? result.pages
      : [createPage('笔记 1', '')];

    activeId = result.activeId || pages[0].id;
    if (!getPage(activeId)) activeId = pages[0].id;

    // Restore sidebar state (default: closed)
    const storedOpen = result.sidebarOpen;
    setSidebarOpen(storedOpen === true, false);

    renderSidebar();
    switchTo(activeId, false);
    setSaveState('saved');
  });
}

// ═══════════════════════════════════════
// Page CRUD
// ═══════════════════════════════════════
function createPage(title, content) {
  const now = Date.now();
  return { id: uid(), title: title || '', content: content || '', createdAt: now, updatedAt: now };
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

  pages.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'page-item' + (p.id === activeId ? ' active' : '');
    item.dataset.id = p.id;

    const titleEl = document.createElement('div');
    titleEl.className = 'page-item-title' + (p.title ? '' : ' empty-title-hint');
    titleEl.textContent = p.title || '无标题';
    titleEl.title = p.title || '无标题';

    const previewEl = document.createElement('div');
    previewEl.className = 'page-item-preview';
    const firstLine = (p.content || '').split('\n').find(l => l.trim()) || '';
    previewEl.textContent = clamp(firstLine, 28) || '暂无内容';

    const delBtn = document.createElement('button');
    delBtn.className = 'page-item-delete';
    delBtn.title = '删除此页';
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M2 3h8M4.5 3V2.4A.4.4 0 014.9 2h2.2a.4.4 0 01.4.4V3M9.5 3l-.5 6.3A.9.9 0 018.1 10H3.9A.9.9 0 013 9.3L2.5 3"
        stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pendingDeleteId = p.id;
      const pg = getPage(p.id);
      document.getElementById('confirmTitle').textContent =
        `删除「${pg.title || '无标题'}」？`;
      overlay.hidden = false;
    });

    item.appendChild(titleEl);
    item.appendChild(previewEl);
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
  btnDeletePage.disabled       = show;
  btnCopy.disabled             = show;
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
  if (!activeId) return;
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
