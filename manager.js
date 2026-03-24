// Manager Page Script - 笔记管理页面逻辑

let allHighlights = {};
let allSummaries = {};

document.addEventListener('DOMContentLoaded', () => {
  // 初始化存储
  if (window.Storage) {
    Storage.init();
  }
  loadData();
  setupEventListeners();

  // 监听存储变化，实时更新
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && (changes.highlights || changes.summaries)) {
      loadData();
    }
  });
});

// 加载数据
async function loadData() {
  try {
    // 使用统一的 Storage 接口
    allHighlights = await Storage.getAllHighlights();
    allSummaries = await Storage.getAllSummaries();

    render();
  } catch (error) {
    console.error('加载数据失败:', error);
    document.getElementById('content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <p>加载失败：${error.message}</p>
      </div>
    `;
  }
}

// 设置事件监听
function setupEventListeners() {
  // 刷新按钮
  document.getElementById('refreshBtn').addEventListener('click', loadData);

  // 导出按钮
  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');

  exportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('show');
  });

  document.addEventListener('click', () => {
    exportMenu.classList.remove('show');
  });

  exportMenu.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const type = item.dataset.type;
      exportData(type);
    });
  });
}

// 渲染笔记列表 - 按网页分组展示
function render() {
  const content = document.getElementById('content');

  // 按网页 URL 分组
  const pages = {};

  // 添加高亮到对应网页
  Object.entries(allHighlights).forEach(([url, highlights]) => {
    if (!pages[url]) {
      pages[url] = {
        url,
        highlights: [],
        summaries: []
      };
    }
    pages[url].highlights = highlights;
  });

  // 添加总结到对应网页
  Object.entries(allSummaries).forEach(([id, summary]) => {
    const url = summary.url;
    if (url) {
      if (!pages[url]) {
        pages[url] = {
          url,
          highlights: [],
          summaries: []
        };
      }
      pages[url].summaries.push(summary);
    }
  });

  // 转换为数组并按最后更新时间排序
  const pageList = Object.values(pages).map(page => {
    // 获取该网页所有项目的最晚更新时间
    const allDates = [
      ...page.highlights.map(h => new Date(h.createdAt || 0).getTime()),
      ...page.summaries.map(s => new Date(s.createdAt || 0).getTime())
    ];
    page.lastUpdated = Math.max(...allDates, 0);
    return page;
  });

  // 按最后更新时间倒序排列
  pageList.sort((a, b) => b.lastUpdated - a.lastUpdated);

  if (pageList.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <p>暂无笔记</p>
        <p style="margin-top: 8px; font-size: 13px;">在网页上选中文本，右键添加高亮标注</p>
      </div>
    `;
    return;
  }

  // 渲染 HTML
  let html = '';
  pageList.forEach(page => {
    html += renderPageGroup(page);
  });

  content.innerHTML = html;

  // 绑定删除事件
  content.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const { type, id, url } = e.target.dataset;
      if (confirm('确定要删除这条笔记吗？')) {
        await deleteItem(type, id, url);
      }
    });
  });

  // 绑定跳转事件
  content.querySelectorAll('.visit-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = e.target.dataset.url;
      chrome.tabs.create({ url });
    });
  });

  // 绑定展开/收起事件
  content.querySelectorAll('.page-header').forEach(header => {
    header.addEventListener('click', (e) => {
      const pageCard = header.parentElement;
      pageCard.classList.toggle('collapsed');
    });
  });
}

// 渲染网页分组
function renderPageGroup(page) {
  const hostname = new URL(page.url).hostname;
  const hasHighlights = page.highlights && page.highlights.length > 0;
  const hasSummaries = page.summaries && page.summaries.length > 0;
  const lastUpdated = new Date(page.lastUpdated);

  let html = `
    <div class="page-card">
      <div class="page-header">
        <div class="page-info">
          <div class="page-title">${escapeHtml(hostname)}</div>
          <div class="page-url">${escapeHtml(page.url)}</div>
        </div>
        <div class="page-meta">
          <span class="badge">${page.highlights.length} 个高亮</span>
          <span class="badge">${page.summaries.length} 个总结</span>
          <span class="time">${formatTime(lastUpdated.toISOString())}</span>
          <button class="collapse-btn">▼</button>
        </div>
      </div>

      <div class="page-content">
        <a href="#" class="visit-link main-link" data-url="${escapeHtml(page.url)}">
          🌐 访问此页面
        </a>

        ${hasSummaries ? `
        <div class="section">
          <div class="section-title">📄 网页总结</div>
          ${page.summaries.map(summary => renderSummaryInPage(page.url, summary)).join('')}
        </div>
        ` : ''}

        ${hasHighlights ? `
        <div class="section">
          <div class="section-title">📌 高亮笔记（${page.highlights.length}）</div>
          ${page.highlights.map(h => renderHighlightInPage(page.url, h)).join('')}
        </div>
        ` : ''}

        ${!hasSummaries && !hasHighlights ? `
        <div class="empty-section">暂无内容</div>
        ` : ''}
      </div>
    </div>
  `;

  return html;
}

// 在网页分组内渲染高亮
function renderHighlightInPage(url, highlight) {
  const annotationHtml = highlight.annotation ?
    `<div class="highlight-annotation">${escapeHtml(highlight.annotation)}</div>` : '';

  return `
    <div class="highlight-item">
      <div class="highlight-text">${escapeHtml(highlight.text)}</div>
      ${annotationHtml}
      <div class="highlight-meta">
        <span>${formatTime(highlight.createdAt || '')}</span>
        <div class="highlight-actions">
          <button class="delete-btn" data-type="highlight" data-url="${escapeHtml(url)}" data-id="${highlight.id}">删除</button>
        </div>
      </div>
    </div>
  `;
}

// 在网页分组内渲染总结
function renderSummaryInPage(url, summary) {
  return `
    <div class="summary-item">
      <div class="summary-title">${escapeHtml(summary.title)}</div>
      <div class="summary-content">${escapeHtml(summary.content).slice(0, 200)}${summary.content.length > 200 ? '...' : ''}</div>
      <div class="summary-meta">
        <span>${summary.type === 'page' ? '📄 网页总结' : '📌 高亮总结'}</span>
        <span>${formatTime(summary.createdAt || '')}</span>
        <button class="delete-btn" data-type="summary" data-id="${summary.id}">删除</button>
      </div>
    </div>
  `;
}

// 删除项目
async function deleteItem(type, id, url) {
  try {
    if (type === 'highlight' && url) {
      await Storage.deleteHighlight(url, id);
      // 通知 sidepanel（如果有打开）
      chrome.runtime.sendMessage({
        action: 'highlightDeleted',
        url: url,
        highlightId: id
      }).catch(() => {});
    } else if (type === 'summary') {
      await Storage.deleteSummary(id);
    }

    // 重新加载
    loadData();
  } catch (error) {
    console.error('删除失败:', error);
    alert('删除失败：' + error.message);
  }
}

// 导出数据
async function exportData(type) {
  let content = '';
  let filename = '';

  // 重新获取最新数据
  const highlights = await Storage.getAllHighlights();
  const summaries = await Storage.getAllSummaries();

  if (type === 'all' || type === 'highlights') {
    content += '# 高亮笔记\n\n';
    Object.entries(highlights).forEach(([url, urlHighlights]) => {
      urlHighlights.forEach(h => {
        content += `## ${h.text}\n`;
        content += `来源：${url}\n`;
        content += `时间：${formatTime(h.createdAt)}\n`;
        if (h.annotation) {
          content += `\n> ${h.annotation}\n`;
        }
        content += `\n`;
      });
    });
  }

  if (type === 'all' || type === 'summaries') {
    content += '\n# AI 总结\n\n';
    Object.entries(summaries).forEach(([id, summary]) => {
      content += `## ${summary.title}\n`;
      content += `来源：${summary.url || '未知'}\n`;
      content += `时间：${formatTime(summary.createdAt)}\n`;
      content += `\n${summary.content}\n\n`;
    });
  }

  filename = `笔记导出-${new Date().toISOString().split('T')[0]}.md`;

  // 创建下载
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 工具函数
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '未知日期';
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return '今天';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return '昨天';
  } else {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
