// Storage Utility - 存储工具模块
// 支持文件系统存储和 WebDAV 同步

// 引入依赖模块
const Storage = {
  // 使用文件系统存储
  useFilesystem: false,

  // 初始化
  async init() {
    // 检查是否已初始化文件系统存储
    if (window.FsStorage) {
      this.useFilesystem = await FsStorage.isInitialized();
    }

    // 初始化 WebDAV 客户端
    if (window.WebDAVClient) {
      await WebDAVClient.init();
    }
  },

  // 保存高亮
  async saveHighlight(url, highlight) {
    if (this.useFilesystem && window.FsStorage) {
      const result = await FsStorage.saveHighlight(url, highlight);

      // 如果启用了 WebDAV，同步到远程
      if (window.WebDAVClient && WebDAVClient.isEnabled()) {
        const domain = FsStorage.getDomain(url);
        const hash = FsStorage.generateHash(url);
        const data = await FsStorage.readFile('highlights', domain, hash);
        await WebDAVClient.syncUpload(`highlights/${domain}/${hash}.json`, data);
      }

      return result;
    } else {
      // 降级到 chrome.storage.local
      const data = await chrome.storage.local.get('highlights');
      const highlights = data.highlights || {};

      if (!highlights[url]) {
        highlights[url] = [];
      }

      const highlightWithMeta = {
        ...highlight,
        id: highlight.id || this.generateId(),
        createdAt: new Date().toISOString()
      };

      highlights[url].push(highlightWithMeta);
      await chrome.storage.local.set({ highlights });

      return highlightWithMeta;
    }
  },

  // 获取指定 URL 的所有高亮
  async getHighlights(url) {
    if (this.useFilesystem && window.FsStorage) {
      try {
        let highlights = await FsStorage.getHighlights(url);

        // 确保返回的是数组
        if (!Array.isArray(highlights)) {
          highlights = [];
        }

        // 如果文件系统没有找到高亮，降级到 chrome.storage.local
        if (highlights.length === 0) {
          const chromeData = await chrome.storage.local.get('highlights');
          const chromeHighlights = chromeData.highlights || {};
          if (chromeHighlights[url] && chromeHighlights[url].length > 0) {
            return chromeHighlights[url];
          }
        }

        // 如果启用了 WebDAV，尝试从远程同步最新数据
        if (window.WebDAVClient && WebDAVClient.isEnabled()) {
          const domain = FsStorage.getDomain(url);
          const hash = FsStorage.generateHash(url);
          const remoteData = await WebDAVClient.syncDownload(`highlights/${domain}/${hash}.json`);

          if (remoteData && remoteData.highlights && Array.isArray(remoteData.highlights)) {
            // 使用远程数据
            highlights = remoteData.highlights;
            // 更新本地
            await FsStorage.writeFile('highlights', domain, hash, remoteData);
          }
        }

        return highlights;
      } catch (e) {
        console.log('FsStorage.getHighlights 失败，降级到 chrome.storage.local:', e);
      }
    }

    // 降级到 chrome.storage.local
    const data = await chrome.storage.local.get('highlights');
    const highlights = data.highlights || {};
    return highlights[url] || [];
  },

  // 获取所有高亮
  async getAllHighlights() {
    if (this.useFilesystem && window.FsStorage) {
      return await FsStorage.getAllHighlights();
    } else {
      const data = await chrome.storage.local.get('highlights');
      return data.highlights || {};
    }
  },

  // 删除高亮
  async deleteHighlight(url, highlightId) {
    if (this.useFilesystem && window.FsStorage) {
      await FsStorage.deleteHighlight(url, highlightId);

      // 同步到 WebDAV
      if (window.WebDAVClient && WebDAVClient.isEnabled()) {
        const domain = FsStorage.getDomain(url);
        const hash = FsStorage.generateHash(url);
        const data = await FsStorage.readFile('highlights', domain, hash);

        if (data && data.highlights && data.highlights.length > 0) {
          await WebDAVClient.syncUpload(`highlights/${domain}/${hash}.json`, data);
        } else {
          await WebDAVClient.deleteFile(`highlights/${domain}/${hash}.json`);
        }
      }
    } else {
      const data = await chrome.storage.local.get('highlights');
      const highlights = data.highlights || {};

      if (highlights[url]) {
        highlights[url] = highlights[url].filter(h => h.id !== highlightId);
        if (highlights[url].length === 0) {
          delete highlights[url];
        }
        await chrome.storage.local.set({ highlights });
      }
    }
  },

  // 更新高亮标注
  async updateHighlightAnnotation(url, highlightId, annotation) {
    if (this.useFilesystem && window.FsStorage) {
      const result = await FsStorage.updateHighlightAnnotation(url, highlightId, annotation);

      if (result && window.WebDAVClient && WebDAVClient.isEnabled()) {
        const domain = FsStorage.getDomain(url);
        const hash = FsStorage.generateHash(url);
        const data = await FsStorage.readFile('highlights', domain, hash);
        await WebDAVClient.syncUpload(`highlights/${domain}/${hash}.json`, data);
      }

      return result;
    } else {
      const data = await chrome.storage.local.get('highlights');
      const highlights = data.highlights || {};

      if (highlights[url]) {
        const highlight = highlights[url].find(h => h.id === highlightId);
        if (highlight) {
          highlight.annotation = annotation;
          highlight.updatedAt = new Date().toISOString();
          await chrome.storage.local.set({ highlights });
          return highlight;
        }
      }
      return null;
    }
  },

  // 保存总结
  async saveSummary(summary) {
    if (this.useFilesystem && window.FsStorage) {
      const result = await FsStorage.saveSummary(summary);

      if (window.WebDAVClient && WebDAVClient.isEnabled()) {
        const domain = FsStorage.getDomain(summary.url);
        const hash = FsStorage.generateHash(summary.url);
        const data = await FsStorage.readFile('summaries', domain, hash);
        await WebDAVClient.syncUpload(`summaries/${domain}/${hash}.json`, data);
      }

      return result;
    } else {
      const data = await chrome.storage.local.get('summaries');
      const summaries = data.summaries || {};

      const summaryWithMeta = {
        ...summary,
        id: summary.id || this.generateId(),
        createdAt: new Date().toISOString()
      };

      summaries[summaryWithMeta.id] = summaryWithMeta;
      await chrome.storage.local.set({ summaries });

      return summaryWithMeta;
    }
  },

  // 获取所有总结
  async getAllSummaries() {
    if (this.useFilesystem && window.FsStorage) {
      return await FsStorage.getAllSummaries();
    } else {
      const data = await chrome.storage.local.get('summaries');
      return data.summaries || {};
    }
  },

  // 获取指定 URL 的总结
  async getSummariesByUrl(url) {
    const summaries = await this.getAllSummaries();
    return Object.values(summaries).filter(s => s.url === url);
  },

  // 删除总结
  async deleteSummary(summaryId) {
    if (this.useFilesystem && window.FsStorage) {
      await FsStorage.deleteSummary(summaryId);

      // 同步到 WebDAV - 简化处理，重新上传整个文件
      if (window.WebDAVClient && WebDAVClient.isEnabled()) {
        // 需要找到总结所在的文件并更新
        // 这里简化处理，遍历所有总结文件
        const summaries = await this.getAllSummaries();
        // 按域名分组上传
        const grouped = {};
        for (const summary of Object.values(summaries)) {
          if (summary.url) {
            const domain = FsStorage.getDomain(summary.url);
            if (!grouped[domain]) grouped[domain] = [];
            grouped[domain].push(summary);
          }
        }

        for (const [domain, domainSummaries] of Object.entries(grouped)) {
          const hash = FsStorage.generateHash(domainSummaries[0].url);
          await WebDAVClient.syncUpload(`summaries/${domain}/${hash}.json`, {
            domain,
            summaries: domainSummaries
          });
        }
      }
    } else {
      const data = await chrome.storage.local.get('summaries');
      const summaries = data.summaries || {};
      delete summaries[summaryId];
      await chrome.storage.local.set({ summaries });
    }
  },

  // 导出总结为 Markdown
  exportSummaryToMarkdown(summary) {
    let md = `# ${summary.title}\n\n`;
    md += `> 来源：${summary.url}\n`;
    md += `> 创建时间：${new Date(summary.createdAt).toLocaleString('zh-CN')}\n\n`;

    if (summary.type === 'highlights' && summary.highlights?.length > 0) {
      md += `## 高亮内容\n\n`;
      summary.highlights.forEach((h, i) => {
        md += `${i + 1}. **${h.text}**\n`;
        if (h.annotation) {
          md += `   > ${h.annotation}\n`;
        }
      });
      md += `\n`;
    }

    md += `## AI 总结\n\n${summary.content}\n`;

    return md;
  },

  // 导出所有笔记为 Markdown
  exportAllNotesToMarkdown() {
    const highlights = this.getAllHighlights();
    const summaries = this.getAllSummaries();

    let md = `# 个人笔记总结\n\n`;
    md += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;

    // 按日期分组显示
    const groupedByDate = {};

    Object.entries(highlights).forEach(([url, urlHighlights]) => {
      urlHighlights.forEach(h => {
        const date = h.createdAt?.split('T')[0] || '未知';
        if (!groupedByDate[date]) {
          groupedByDate[date] = [];
        }
        groupedByDate[date].push({ type: 'highlight', url, data: h });
      });
    });

    Object.values(summaries).forEach(s => {
      const date = s.createdAt?.split('T')[0] || '未知';
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push({ type: 'summary', data: s });
    });

    // 按日期倒序排列
    Object.keys(groupedByDate).sort().reverse().forEach(date => {
      md += `## ${date}\n\n`;

      groupedByDate[date].forEach(item => {
        if (item.type === 'highlight') {
          md += `### 📌 ${item.data.text}\n`;
          md += `来源：[${new URL(item.url).hostname}](${item.url})\n`;
          if (item.data.annotation) {
            md += `\n> ${item.data.annotation}\n`;
          }
          md += `\n`;
        } else {
          md += `### 📄 ${item.data.title}\n`;
          md += `来源：[${new URL(item.data.url).hostname}](${item.data.url})\n`;
          md += `\n${item.data.content}\n\n`;
        }
      });
    });

    return md;
  },

  // 生成唯一 ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // 从 chrome.storage.local 迁移到文件系统
  async migrateToFilesystem() {
    if (window.FsStorage) {
      return await FsStorage.migrateFromChromeStorage();
    }
    throw new Error('文件系统存储不可用');
  },

  // 获取存储状态
  async getStorageStatus() {
    const status = {
      type: this.useFilesystem ? 'filesystem' : 'chrome_storage',
      webdavEnabled: window.WebDAVClient ? WebDAVClient.isEnabled() : false
    };

    if (window.FsStorage) {
      status.fsInitialized = await FsStorage.isInitialized();
    }

    return status;
  }
};

// 自动初始化
if (typeof window !== 'undefined') {
  window.Storage = Storage;
  // 页面加载时初始化
  document.addEventListener('DOMContentLoaded', () => {
    Storage.init();
  });
}
