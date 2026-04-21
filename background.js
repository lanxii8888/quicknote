// 轻笔记 — Background Service Worker

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({ note: '', lastSaved: null, installTime: Date.now() });
  }
  // Enable side panel for all tabs by default
  chrome.sidePanel.setOptions({ enabled: true });
});

// Click toolbar icon → toggle side panel
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Keyboard shortcut → toggle side panel
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-sidepanel') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  }
});
