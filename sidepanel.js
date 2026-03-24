// Side Panel Script

// DOM 元素
const summarizePageBtn = document.getElementById('summarizePageBtn');
const summarizeHighlightsBtn = document.getElementById('summarizeHighlightsBtn');
const saveBtn = document.getElementById('saveBtn');
const copyBtn = document.getElementById('copyBtn');
const managerBtn = document.getElementById('managerBtn');
const loading = document.getElementById('loading');
const resultPage = document.getElementById('result-page');
const resultHighlights = document.getElementById('result-highlights');
const error = document.getElementById('error');
const footer = document.getElementById('footer');
const highlightsSection = document.getElementById('highlightsSection');
const highlightsList = document.getElementById('highlightsList');
const highlightCount = document.getElementById('highlightCount');

// 总结类型切换按钮
const toggleBtns = document.querySelectorAll('.toggle-btn');

// 当前摘要内容
let currentSummaryPage = '';
let currentSummaryPageHtml = '';
let currentSummaryHighlights = '';
let currentSummaryHighlightsHtml = '';
let currentHighlights = [];
let currentPageUrl = '';
let existingSummaryPageId = null; // 已存在的网页总结 ID
let existingSummaryHighlightsId = null; // 已存在的高亮总结 ID
let currentView = 'page'; // 当前显示的总结类型 'page' or 'highlights'

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 等待 Storage 模块初始化完成
  if (window.Storage) {
    await Storage.init();
    console.log('[SidePanel] Storage 模块初始化完成，useFilesystem:', Storage.useFilesystem);
  }

  summarizePageBtn.addEventListener('click', () => handleSummarize('page'));
  summarizeHighlightsBtn.addEventListener('click', () => handleSummarize('highlights'));
  saveBtn.addEventListener('click', handleSave);
  copyBtn.addEventListener('click', handleCopy);

  // 监听总结视图切换
  toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });

  // 加载当前页面高亮
  loadCurrentPageInfo();
  await loadCurrentPageHighlights();
  checkExistingSummaries();

  // 监听存储变化，实时更新高亮和总结
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.highlights) {
        loadCurrentPageHighlights();
        checkExistingSummaries();
      }
      if (changes.summaries) {
        checkExistingSummaries();
      }
    }
  });

  // 监听来自其他页面的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'highlightCreated' || request.action === 'highlightDeleted') {
      loadCurrentPageHighlights();
      checkExistingSummaries();
      sendResponse({ success: true });
      return false;
    }
    if (request.action === 'tabUpdated') {
      loadCurrentPageInfo();
      loadCurrentPageHighlights();
      checkExistingSummaries();
      sendResponse({ success: true });
      return false;
    }
    return false;
  });
});

// 切换总结视图
function switchView(view) {
  currentView = view;

  // 更新按钮状态
  toggleBtns.forEach(btn => {
    if (btn.dataset.view === view) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 切换显示区域
  if (view === 'page') {
    resultPage.hidden = false;
    resultHighlights.hidden = true;
    highlightsSection.hidden = true;
    summarizePageBtn.hidden = false;
    summarizeHighlightsBtn.hidden = true;
  } else {
    resultPage.hidden = true;
    resultHighlights.hidden = false;
    highlightsSection.hidden = false;
    summarizePageBtn.hidden = true;
    summarizeHighlightsBtn.hidden = false;
  }

  // 更新 footer 显示 - 始终显示在同一个位置
  footer.hidden = false;
}

// 加载当前页面信息
async function loadCurrentPageInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentPageUrl = tab.url;
      // 更新两个标题
      const titleElementPage = document.getElementById('pageTitle-page');
      const titleElementHighlights = document.getElementById('pageTitle-highlights');
      if (titleElementPage) titleElementPage.textContent = tab.title;
      if (titleElementHighlights) titleElementHighlights.textContent = tab.title;
    }
  } catch (error) {
    console.error('获取页面信息失败:', error);
  }
}

// 加载当前页面高亮
async function loadCurrentPageHighlights() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    let urlHighlights = [];

    // 尝试使用 Storage 接口，如果不可用则降级到 chrome.storage.local
    if (window.Storage) {
      try {
        urlHighlights = await Storage.getHighlights(tab.url);
      } catch (e) {
        console.log('Storage.getHighlights 失败，降级到 chrome.storage.local:', e);
      }
    }

    // 确保是数组格式
    if (!Array.isArray(urlHighlights)) {
      urlHighlights = [];
    }

    currentHighlights = urlHighlights;
    highlightCount.textContent = currentHighlights.length;

    console.log('[SidePanel] 当前页面高亮数量:', currentHighlights.length);

    // 渲染高亮列表
    if (currentHighlights.length > 0) {
      highlightsList.innerHTML = currentHighlights.map(h => `
        <div class="highlight-item">
          <div class="highlight-text">${escapeHtml(h.text)}</div>
          ${h.annotation ? `<div class="highlight-annotation">${escapeHtml(h.annotation)}</div>` : ''}
        </div>
      `).join('');
    } else {
      highlightsList.innerHTML = '<p class="empty-message">暂无高亮，选中文本后右键添加</p>';
    }
  } catch (error) {
    console.error('加载高亮失败:', error);
  }
}

// 检查是否存在已保存的总结（网页总结和高亮总结分别检查）
async function checkExistingSummaries() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // 使用 Storage 接口获取总结
    const summaries = await Storage.getAllSummaries();

    // 重置 ID
    existingSummaryPageId = null;
    existingSummaryHighlightsId = null;

    // 查找当前 URL 的总结（按类型分开）
    for (const [id, summary] of Object.entries(summaries)) {
      if (summary.url === tab.url) {
        if (summary.type === 'page') {
          existingSummaryPageId = id;
          // 自动展示已保存的网页总结
          showResult('page', summary.content, summary.title);
        } else if (summary.type === 'highlights') {
          existingSummaryHighlightsId = id;
          // 自动展示已保存的高亮总结
          showResult('highlights', summary.content, summary.title);
        }
      }
    }

    // 更新按钮文字
    updateSummarizeButtonText();
  } catch (error) {
    console.error('检查已有总结失败:', error);
  }
}

// 更新总结按钮文字
function updateSummarizeButtonText() {
  // 更新网页总结按钮
  if (existingSummaryPageId) {
    summarizePageBtn.textContent = '🔄 更新网页总结';
  } else {
    summarizePageBtn.textContent = '📄 生成网页总结';
  }

  // 更新高亮总结按钮
  if (existingSummaryHighlightsId) {
    summarizeHighlightsBtn.textContent = '🔄 更新高亮总结';
  } else {
    summarizeHighlightsBtn.textContent = '📌 生成高亮总结';
  }
}

// 处理总结按钮点击
async function handleSummarize(type) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    showError('无法获取当前标签页');
    return;
  }

  // 如果是高亮总结，确保先加载最新的高亮数据
  if (type === 'highlights') {
    await loadCurrentPageHighlights();
    console.log('[SidePanel] handleSummarize highlights - currentHighlights:', currentHighlights);

    if (!currentHighlights || currentHighlights.length === 0) {
      showError('当前页面没有高亮内容，请先添加高亮');
      return;
    }
  }

  setLoading(true);

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'summarize',
      tabId: tab.id,
      summaryType: type
    });

    if (response?.success) {
      showResult(type, response.summary, tab.title, response.highlights);
      // 生成新总结后，更新按钮文字
      updateSummarizeButtonText();
    } else {
      showError(response?.error || '总结失败');
    }
  } catch (err) {
    showError(err.message || '网络错误，请重试');
  } finally {
    setLoading(false);
  }
}

// 显示加载状态
function setLoading(isLoading) {
  if (isLoading) {
    summarizePageBtn.disabled = true;
    summarizeHighlightsBtn.disabled = true;
    loading.hidden = false;
    resultPage.hidden = true;
    resultHighlights.hidden = true;
    error.hidden = true;
    footer.hidden = true;
  } else {
    summarizePageBtn.disabled = false;
    summarizeHighlightsBtn.disabled = false;
    loading.hidden = true;
  }
}

// 显示结果
function showResult(type, summary, title, highlights) {
  if (type === 'page') {
    currentSummaryPage = summary;
    currentSummaryPageHtml = parseMarkdown(summary);
    const titleEl = document.getElementById('pageTitle-page');
    if (titleEl) titleEl.textContent = title || '未知页面';
    document.getElementById('summaryContent-page').innerHTML = currentSummaryPageHtml;
    resultPage.hidden = false;
  } else if (type === 'highlights') {
    currentSummaryHighlights = summary;
    currentSummaryHighlightsHtml = parseMarkdown(summary);
    const titleEl = document.getElementById('pageTitle-highlights');
    if (titleEl) titleEl.textContent = title || '未知页面';
    document.getElementById('summaryContent-highlights').innerHTML = currentSummaryHighlightsHtml;
    resultHighlights.hidden = false;
  }

  currentHighlights = highlights || [];
  footer.hidden = false;
}

// 显示错误
function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  error.hidden = false;
}

// 处理保存按钮点击
async function handleSave() {
  const summaryToSave = currentView === 'page' ? currentSummaryPage : currentSummaryHighlights;
  const summaryId = currentView === 'page' ? existingSummaryPageId : existingSummaryHighlightsId;

  if (!summaryToSave) return;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const summaryType = currentView;

    const summaryData = {
      url: currentPageUrl || tab?.url,
      title: currentView === 'page' ?
        document.getElementById('pageTitle-page').textContent :
        document.getElementById('pageTitle-highlights').textContent,
      content: summaryToSave,
      type: summaryType,
      highlights: currentHighlights.map(h => h.id)
    };

    // 使用 Storage 接口保存
    if (summaryId) {
      // 更新现有总结 - 先删除再保存
      await Storage.deleteSummary(summaryId);
    }

    await Storage.saveSummary(summaryData);

    // 重新检查总结状态
    checkExistingSummaries();

    // 显示保存成功提示
    saveBtn.textContent = '✅ 已保存';
    setTimeout(() => {
      saveBtn.textContent = '💾 保存';
    }, 2000);
  } catch (err) {
    console.error('保存失败:', err);
    alert('保存失败：' + err.message);
  }
}

// 处理复制按钮点击
async function handleCopy() {
  const summaryToCopy = currentView === 'page' ? currentSummaryPage : currentSummaryHighlights;

  if (!summaryToCopy) return;

  try {
    await navigator.clipboard.writeText(summaryToCopy);
    copyBtn.textContent = '✅ 已复制';
    setTimeout(() => {
      copyBtn.textContent = '📋 复制';
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
  }
}

// 简单的 markdown 转 HTML 函数
function parseMarkdown(md) {
  if (!md) return '';

  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^\s*>\s+(.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');

  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  html = html.replace(/<\/ul>(<br>)?<ul>/g, '');

  return html;
}

// 转义 HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
