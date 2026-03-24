// Service Worker - 后台脚本

// 安装时设置侧边栏行为和右键菜单
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Page Summarizer 已安装');

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'highlight-selection',
    title: '📝 添加高亮标注',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'summarize-page',
    title: '📄 总结当前页面',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'open-manager',
    title: '📚 打开笔记管理',
    contexts: ['action']
  });
});

// 右键菜单点击处理
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'highlight-selection') {
    // 通知 content script 显示高亮工具栏
    chrome.tabs.sendMessage(tab.id, {
      action: 'showHighlightToolbar',
      selectionText: info.selectionText
    });
  } else if (info.menuItemId === 'summarize-page') {
    // 打开侧边栏
    chrome.sidePanel.open({ windowId: tab.windowId });
  } else if (info.menuItemId === 'open-manager') {
    // 打开笔记管理页面
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  }
});

// 点击扩展图标时打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// 允许从页面操作打开侧边栏
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
  console.error('设置侧边栏行为失败:', error);
});

// 监听标签页切换，通知 sidepanel 更新
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) {
      // 通知 sidepanel 当前标签页已更改
      chrome.runtime.sendMessage({
        action: 'tabUpdated',
        tabId: activeInfo.tabId,
        url: tab.url,
        title: tab.title
      }).catch(() => {
        // sidepanel 可能未打开，忽略错误
      });
    }
  });
});

// 监听标签页更新（例如页面加载完成）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    chrome.runtime.sendMessage({
      action: 'tabUpdated',
      tabId: tabId,
      url: tab.url,
      title: tab.title
    }).catch(() => {
      // sidepanel 可能未打开，忽略错误
    });
  }
});

// API 配置
const API_CONFIG = {
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini'
  },
  claude: {
    url: 'https://api.anthropic.com/v1/messages',
    model: 'claude-sonnet-4-20250514'
  },
  qwen: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-turbo'
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat'
  },
  builtin: {
    name: 'Chrome Built-in Summarizer'
  }
};

// 系统提示词
const SYSTEM_PROMPT = '请用中文总结以下网页内容，提取核心要点，控制在 300 字以内。';

// 监听来自侧边栏的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'summarize') {
    handleSummarizeRequest(request, sendResponse);
    return true;
  }

  if (request.action === 'getPageContent') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs[0]) {
        try {
          const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getPageContent' });
          sendResponse(response);
        } catch (error) {
          // content script 可能未注入，尝试动态注入
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ['content.js']
            });
            // 稍后重试
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, { action: 'getPageContent' }, (response) => {
                sendResponse(response || { success: false, error: '无法连接到页面' });
              });
            }, 100);
            return;
          } catch (e) {
            sendResponse({ success: false, error: '无法获取页面内容，请刷新页面重试' });
          }
        }
      } else {
        sendResponse({ success: false, error: '未找到活动标签页' });
      }
    });
    return true;
  }

  if (request.action === 'getConfig') {
    chrome.storage.local.get(['provider', 'apiKey'], (result) => {
      sendResponse({
        provider: result.provider || 'openai',
        apiKey: result.apiKey
      });
    });
    return true;
  }

  if (request.action === 'getHighlights') {
    chrome.storage.local.get('highlights', (data) => {
      const highlights = data.highlights || {};
      const urlHighlights = highlights[request.url] || [];
      sendResponse({
        success: true,
        highlights: urlHighlights
      });
    });
    return true;
  }

  if (request.action === 'saveSummary') {
    saveSummary(request.summary).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'highlightCreated') {
    console.log('高亮已创建:', request.highlight);
    // 转发到 sidepanel（如果有打开）
    chrome.runtime.sendMessage({
      action: 'highlightCreated',
      url: request.url,
      highlight: request.highlight
    }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'highlightDeleted') {
    console.log('高亮已删除:', request.highlightId);
    // 转发到 sidepanel（如果有打开）
    chrome.runtime.sendMessage({
      action: 'highlightDeleted',
      url: request.url,
      highlightId: request.highlightId
    }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }
});

// 处理总结请求
async function handleSummarizeRequest(request, sendResponse) {
  try {
    const config = await chrome.storage.local.get(['provider', 'apiKey', 'summaryType']);
    const provider = config.provider || 'openai';
    const apiKey = config.apiKey;
    const summaryType = request.summaryType || config.summaryType || 'page'; // 'page' or 'highlights'

    if (provider !== 'builtin' && !apiKey) {
      sendResponse({
        success: false,
        error: '请先在设置页面配置 API Key'
      });
      return;
    }

    // 获取页面内容和可选的高亮内容
    const [pageContent, highlightsData] = await Promise.all([
      getPageContent(),
      summaryType === 'highlights' ? getCurrentPageHighlights() : Promise.resolve(null)
    ]);

    if (!pageContent?.success) {
      sendResponse({
        success: false,
        error: pageContent?.error || '无法获取页面内容'
      });
      return;
    }

    let contentToSummarize = pageContent.content;
    let highlights = null;

    // 如果选择仅总结高亮内容
    if (summaryType === 'highlights' && highlightsData?.length > 0) {
      highlights = highlightsData;
      const highlightTexts = highlightsData.map(h => {
        let text = `**${h.text}**`;
        if (h.annotation) {
          text += `\n标注：${h.annotation}`;
        }
        return text;
      }).join('\n\n');

      contentToSummarize = `以下是用户标记的重要内容和标注：\n\n${highlightTexts}\n\n请根据这些高亮内容进行总结。`;
    }

    let summary;
    if (provider === 'builtin') {
      summary = await summarizeWithBuiltinAI(contentToSummarize);
    } else {
      const apiConfig = API_CONFIG[provider];
      summary = await callAIApi(provider, apiConfig, apiKey, contentToSummarize);
    }

    sendResponse({
      success: true,
      summary: summary,
      highlights: highlights
    });
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

// 获取当前页面高亮
function getCurrentPageHighlights() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.storage.local.get('highlights', (data) => {
          const highlights = data.highlights || {};
          const url = tabs[0].url;
          resolve(highlights[url] || []);
        });
      } else {
        resolve([]);
      }
    });
  });
}

// 获取页面内容
function getPageContent() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getPageContent' }, (response) => {
          resolve(response);
        });
      }
    });
  });
}

// 保存总结
async function saveSummary(summaryData) {
  const data = await chrome.storage.local.get('summaries');
  const summaries = data.summaries || {};

  const summary = {
    ...summaryData,
    id: summaryData.id || generateId(),
    createdAt: summaryData.createdAt || new Date().toISOString(),
    updatedAt: summaryData.updatedAt ? new Date(summaryData.updatedAt).toISOString() : undefined
  };

  summaries[summary.id] = summary;
  await chrome.storage.local.set({ summaries });
  return summary;
}

// 调用 AI API
async function callAIApi(provider, apiConfig, apiKey, content) {
  const truncatedContent = content.substring(0, 15000);

  if (provider === 'claude') {
    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: apiConfig.model,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `${SYSTEM_PROMPT}\n\n${truncatedContent}`
        }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'API 调用失败');
    }
    return data.content[0].text;
  } else if (provider === 'deepseek') {
    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: truncatedContent }
        ],
        max_tokens: 1024
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'API 调用失败');
    }
    return data.choices[0].message.content;
  } else if (provider === 'qwen') {
    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.model,
        input: {
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: truncatedContent }
          ]
        },
        parameters: { max_tokens: 1024 }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error?.message || 'API 调用失败');
    }
    return data.output?.choices?.[0]?.message?.content || data.choices?.[0]?.message?.content;
  } else {
    // OpenAI
    const response = await fetch(apiConfig.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: apiConfig.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: truncatedContent }
        ],
        max_tokens: 1024
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'API 调用失败');
    }
    return data.choices[0].message.content;
  }
}

// 使用 Chrome 内置 Summarizer API
async function summarizeWithBuiltinAI(content) {
  if (typeof Summarizer === 'undefined') {
    throw new Error('当前浏览器不支持 Summarizer API');
  }

  const availability = await Summarizer.availability();
  if (availability !== 'readily-available') {
    throw new Error(`Summarizer 不可用：${availability}`);
  }

  const summarizer = new Summarizer({
    type: 'key-points',
    format: 'markdown',
    length: 'medium'
  });

  try {
    const result = await summarizer.summarize(content);
    return result.content;
  } finally {
    await summarizer.close();
  }
}

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
