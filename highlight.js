// Highlight Manager - 高亮管理

(function() {
  // 防止重复加载
  if (window.aiHighlightLoaded) return;
  window.aiHighlightLoaded = true;

  console.log('[AI Highlight] Module loaded');

  let currentSelection = null;
  let selectedColor = '#ffff00';
  let toolbar = null;
  let annotationModal = null;
  let highlights = [];

  // 预设颜色
  const colors = ['#ffff00', '#00ff00', '#00ffff', '#ff00ff', '#ffa500', '#ff6b6b'];

  // 等待 DOM 准备好
  function waitForBody(callback) {
    if (document.body) {
      callback();
    } else {
      setTimeout(() => waitForBody(callback), 50);
    }
  }

  // 初始化
  function init() {
    waitForBody(() => {
      console.log('[AI Highlight] Initializing...');
      createToolbar();
      createAnnotationModal();
      setupEventListeners();
      loadAndRestoreHighlights();
      console.log('[AI Highlight] Initialized');
    });
  }

  // 创建带猫猫的工具栏
  function createToolbar() {
    if (toolbar) return;

    toolbar = document.createElement('div');
    toolbar.className = 'ai-selection-toolbar';
    toolbar.innerHTML = `
      <div class="ai-toolbar-cat"></div>
      <div class="ai-toolbar-body">
        <button class="ai-toolbar-btn" id="ai-add-highlight" title="添加高亮">
          <span class="ai-btn-icon">🖍️</span>
          <span class="ai-btn-text">高亮</span>
        </button>
        <button class="ai-toolbar-btn" id="ai-add-annotation" title="添加批注">
          <span class="ai-btn-icon">💬</span>
          <span class="ai-btn-text">批注</span>
        </button>
      </div>
    `;
    document.body.appendChild(toolbar);
    console.log('[AI Highlight] Toolbar created');

    // 高亮按钮
    const highlightBtn = document.getElementById('ai-add-highlight');
    if (highlightBtn) {
      highlightBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyCurrentSelectionHighlight();
      });
    }

    // 批注按钮
    const annotationBtn = document.getElementById('ai-add-annotation');
    if (annotationBtn) {
      annotationBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showAnnotationModal();
      });
    }
  }

  // 创建标注弹窗
  function createAnnotationModal() {
    if (annotationModal) return;

    annotationModal = document.createElement('div');
    annotationModal.className = 'ai-annotation-modal';
    annotationModal.innerHTML = `
      <div class="ai-annotation-content">
        <div class="ai-modal-header">
          <span class="ai-modal-cat"></span>
          <h3>添加批注</h3>
        </div>
        <textarea placeholder="输入你的笔记或批注..."></textarea>
        <div class="ai-color-picker">
          ${colors.map(c => `<button class="ai-color-btn" data-color="${c}" style="background:${c}"></button>`).join('')}
          <button class="ai-custom-color" title="自定义颜色">
            <input type="color" id="ai-custom-color-input" value="#ffff00">
          </button>
        </div>
        <div class="ai-annotation-actions">
          <button class="cancel-btn">取消</button>
          <button class="save-btn">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(annotationModal);
    console.log('[AI Highlight] Annotation modal created');

    // 颜色选择
    annotationModal.querySelectorAll('.ai-color-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedColor = btn.dataset.color;
        annotationModal.querySelectorAll('.ai-color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('ai-custom-color-input').value = selectedColor;
      });
    });

    // 自定义颜色
    const customColorInput = document.getElementById('ai-custom-color-input');
    if (customColorInput) {
      customColorInput.addEventListener('input', (e) => {
        selectedColor = e.target.value;
        annotationModal.querySelectorAll('.ai-color-btn').forEach(b => b.classList.remove('active'));
      });
    }

    // 取消按钮
    const cancelBtn = annotationModal.querySelector('.cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', hideAnnotationModal);
    }

    // 保存按钮
    const saveBtn = annotationModal.querySelector('.save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveHighlight);
    }

    // 点击背景关闭
    annotationModal.addEventListener('click', (e) => {
      if (e.target === annotationModal) {
        hideAnnotationModal();
      }
    });
  }

  // 设置事件监听
  function setupEventListeners() {
    document.addEventListener('selectionchange', handleSelectionChange);

    document.addEventListener('mousedown', (e) => {
      if (toolbar && !toolbar.contains(e.target)) {
        hideToolbar();
      }
    });

    if (chrome.runtime) {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log('[AI Highlight] Received message:', request.action);

        if (request.action === 'restoreHighlights') {
          loadAndRestoreHighlights().then(() => {
            sendResponse({ success: true });
          });
          return true;
        }

        if (request.action === 'showHighlightToolbar') {
          showToolbar();
          sendResponse({ success: true });
          return true;
        }

        return true;
      });
    }

    console.log('[AI Highlight] Event listeners setup');
  }

  // 加载并恢复高亮
  async function loadAndRestoreHighlights() {
    return new Promise((resolve) => {
      if (!chrome.storage) {
        console.log('[AI Highlight] No chrome.storage');
        resolve();
        return;
      }

      chrome.storage.local.get('highlights', (data) => {
        const allHighlights = data.highlights || {};
        const url = window.location.href;
        highlights = allHighlights[url] || [];

        console.log('[AI Highlight] Found', highlights.length, 'highlights for this URL');

        // 恢复显示高亮
        highlights.forEach(h => {
          renderHighlight(h);
        });

        resolve();
      });
    });
  }

  // 处理选择变化
  function handleSelectionChange() {
    const selection = window.getSelection();

    if (selection && selection.toString().trim().length > 0) {
      // 忽略在工具栏或弹窗内的选择
      if (toolbar && toolbar.contains(selection.anchorNode)) {
        return;
      }
      if (annotationModal && annotationModal.contains(selection.anchorNode)) {
        return;
      }

      currentSelection = selection;
      showToolbar();
    } else {
      currentSelection = null;
      hideToolbar();
    }
  }

  // 显示工具栏
  function showToolbar() {
    if (!currentSelection || !toolbar) return;

    try {
      const range = currentSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      toolbar.style.left = `${rect.right + 10}px`;
      toolbar.style.top = `${rect.top + window.scrollY}px`;
      toolbar.classList.add('visible');
    } catch (e) {
      console.error('[AI Highlight] Error showing toolbar:', e);
    }
  }

  // 隐藏工具栏
  function hideToolbar() {
    if (toolbar) {
      toolbar.classList.remove('visible');
    }
  }

  // 应用当前选择的高亮
  function applyCurrentSelectionHighlight() {
    if (!currentSelection) return;

    const text = currentSelection.toString().trim();
    if (!text) return;

    const range = currentSelection.getRangeAt(0);

    const highlightData = {
      id: generateId(),
      text: text,
      annotation: '',
      xpath: getXPath(range.startContainer),
      color: selectedColor,
      createdAt: new Date().toISOString()
    };

    saveHighlightData(highlightData);
    hideToolbar();
    currentSelection.removeAllRanges();
  }

  // 显示标注弹窗
  function showAnnotationModal() {
    if (annotationModal) {
      annotationModal.classList.add('visible');
      const textarea = annotationModal.querySelector('textarea');
      if (textarea) textarea.focus();
    }
    hideToolbar();
  }

  // 隐藏标注弹窗
  function hideAnnotationModal() {
    if (annotationModal) {
      annotationModal.classList.remove('visible');
      const textarea = annotationModal.querySelector('textarea');
      if (textarea) textarea.value = '';
    }
  }

  // 保存高亮（带标注）
  function saveHighlight() {
    if (!currentSelection) return;

    const textarea = annotationModal.querySelector('textarea');
    const annotation = textarea ? textarea.value.trim() : '';
    const text = currentSelection.toString().trim();

    if (!text) {
      hideAnnotationModal();
      return;
    }

    const range = currentSelection.getRangeAt(0);

    const highlightData = {
      id: generateId(),
      text: text,
      annotation: annotation,
      xpath: getXPath(range.startContainer),
      color: selectedColor,
      createdAt: new Date().toISOString()
    };

    saveHighlightData(highlightData);
    hideAnnotationModal();
    currentSelection.removeAllRanges();
  }

  // 保存高亮数据 - 同时保存到 chrome.storage.local 和通知 Storage 模块
  async function saveHighlightData(highlightData) {
    const url = window.location.href;

    // 保存到 chrome.storage.local（这是内容脚本的主要存储方式）
    chrome.storage.local.get('highlights', (data) => {
      const allHighlights = data.highlights || {};
      if (!allHighlights[url]) {
        allHighlights[url] = [];
      }
      allHighlights[url].push(highlightData);

      chrome.storage.local.set({ highlights: allHighlights }, () => {
        highlights.push(highlightData);
        renderHighlight(highlightData);
        console.log('[AI Highlight] Highlight saved to chrome.storage.local');
      });
    });

    // 通知 sidepanel 和其他页面数据已更新
    if (chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'highlightCreated',
        url: url,
        highlight: highlightData
      });
    }
  }

  // 渲染高亮到页面
  function renderHighlight(highlightData) {
    try {
      // 首先尝试使用 XPath 查找
      let node = null;
      try {
        const result = document.evaluate(
          highlightData.xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        node = result.singleNodeValue;
      } catch (e) {
        console.log('[AI Highlight] XPath evaluation failed:', e);
      }

      // 如果 XPath 找不到，尝试在整个文档中搜索文本
      if (!node) {
        const textNodes = getTextNodes(document.body);
        for (const textNode of textNodes) {
          if (textNode.textContent.includes(highlightData.text)) {
            node = textNode;
            break;
          }
        }
      }

      if (!node) {
        console.log('[AI Highlight] Could not find node for text:', highlightData.text.substring(0, 50));
        return;
      }

      // 查找文本节点
      const textNodes = getTextNodes(node);
      let targetText = highlightData.text;

      for (const textNode of textNodes) {
        const text = textNode.textContent;
        const index = text.indexOf(targetText);

        if (index !== -1) {
          const wrapper = document.createElement('span');
          wrapper.className = 'ai-highlight-wrapper';

          const mark = document.createElement('mark');
          mark.className = 'ai-highlight';
          mark.dataset.highlightId = highlightData.id;
          mark.style.backgroundColor = highlightData.color;

          if (highlightData.annotation) {
            mark.dataset.annotation = highlightData.annotation;
          }

          const before = text.substring(0, index);
          const after = text.substring(index + targetText.length);

          const frag = document.createDocumentFragment();
          if (before) frag.appendChild(document.createTextNode(before));

          const textSpan = document.createElement('span');
          textSpan.className = 'ai-highlight-text';
          textSpan.textContent = targetText;
          mark.appendChild(textSpan);

          if (highlightData.annotation) {
            const tooltip = document.createElement('span');
            tooltip.className = 'ai-highlight-tooltip';
            tooltip.textContent = highlightData.annotation;
            mark.appendChild(tooltip);
          }

          frag.appendChild(mark);

          if (after) frag.appendChild(document.createTextNode(after));

          textNode.parentNode.replaceChild(frag, textNode);
          console.log('[AI Highlight] Highlight rendered');
          break;
        }
      }
    } catch (e) {
      console.error('[AI Highlight] Error rendering highlight:', e);
    }
  }

  // 获取所有文本节点
  function getTextNodes(node) {
    const textNodes = [];

    function getText(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        for (let i = 0; i < node.childNodes.length; i++) {
          getText(node.childNodes[i]);
        }
      }
    }

    getText(node);
    return textNodes;
  }

  // 获取 XPath
  function getXPath(node) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) {
      node = node.parentElement;
    }

    const parts = [];
    let current = node;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      parts.unshift(`${current.nodeName.toLowerCase()}[${index}]`);
      current = current.parentNode;
    }

    return '/' + parts.join('/');
  }

  // 生成 ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else if (document.readyState === 'interactive') {
    setTimeout(init, 100);
  } else {
    init();
  }

  // 暴露全局函数
  window.aiHighlight = {
    restoreHighlights: loadAndRestoreHighlights
  };
})();
