// Content Script - 读取页面内容

(function() {
  console.log('[AI Summarizer] Content script loaded');

  // 监听来自 Service Worker 的消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[AI Summarizer] Received message:', request.action);

    try {
      if (request.action === 'getPageContent') {
        const content = document.body ? document.body.innerText : document.documentElement.innerText;

        console.log('[AI Summarizer] Page content extracted, length:', content.length);

        sendResponse({
          success: true,
          content: content,
          title: document.title,
          url: window.location.href
        });
        return true;
      }

      if (request.action === 'getHighlights') {
        const url = window.location.href;
        if (chrome.storage) {
          chrome.storage.local.get('highlights', (data) => {
            const highlights = data.highlights || {};
            sendResponse({
              success: true,
              highlights: highlights[url] || []
            });
          });
          return true;
        } else {
          sendResponse({ success: true, highlights: [] });
        }
      }

      return true;
    } catch (error) {
      console.error('[AI Summarizer] Error:', error);
      sendResponse({
        success: false,
        error: error.message
      });
      return true;
    }
  });

  console.log('[AI Summarizer] Content script ready');
})();
