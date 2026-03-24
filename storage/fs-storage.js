// File System Storage - 文件系统存储模块

const FsStorage = {
  // 基础目录路径（需要用户授权访问）
  baseDirHandle: null,

  // 初始化，请求目录访问权限
  async init() {
    try {
      // 尝试恢复之前授权的句柄
      const savedHandle = await chrome.storage.local.get('storageDirHandle');
      if (savedHandle.storageDirHandle) {
        try {
          // 验证句柄是否仍然有效
          await savedHandle.storageDirHandle.queryPermission({ mode: 'readwrite' });
          this.baseDirHandle = savedHandle.storageDirHandle;
          return true;
        } catch (e) {
          console.log('保存的句柄已失效，需要重新授权');
        }
      }
      return false;
    } catch (error) {
      console.error('初始化存储目录失败:', error);
      return false;
    }
  },

  // 请求用户选择存储目录
  async requestDirectory() {
    try {
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });

      // 保存句柄供后续使用
      await chrome.storage.local.set({ storageDirHandle: dirHandle });
      this.baseDirHandle = dirHandle;

      // 初始化目录结构
      await this.ensureDirectories();

      return true;
    } catch (error) {
      console.error('选择目录失败:', error);
      return false;
    }
  },

  // 确保目录结构存在
  async ensureDirectories() {
    if (!this.baseDirHandle) return;

    try {
      // 创建 highlights 目录
      await this.baseDirHandle.getDirectoryHandle('highlights', { create: true });
      // 创建 summaries 目录
      await this.baseDirHandle.getDirectoryHandle('summaries', { create: true });
    } catch (error) {
      console.error('创建目录结构失败:', error);
    }
  },

  // 生成 URL 的 hash 作为文件名
  generateHash(url) {
    // 简单 hash：使用 URL 的 MD5 或 SHA 的简化版本
    // 这里使用一个简单的 hash 算法
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).padStart(8, '0');
  },

  // 从 URL 提取域名
  getDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return 'unknown';
    }
  },

  // 获取或创建域名目录
  async getDomainDir(domain, type) {
    const parentDir = type === 'highlights' ? 'highlights' : 'summaries';
    const parentHandle = await this.baseDirHandle.getDirectoryHandle(parentDir);
    const domainHandle = await parentHandle.getDirectoryHandle(domain, { create: true });
    return domainHandle;
  },

  // 读取文件
  async readFile(type, domain, hash) {
    try {
      const domainHandle = await this.getDomainDir(domain, type);
      const fileName = `${hash}.json`;

      try {
        const fileHandle = await domainHandle.getFileHandle(fileName);
        const file = await fileHandle.getFile();
        const text = await file.text();
        return JSON.parse(text);
      } catch (e) {
        // 文件不存在，返回默认结构
        return type === 'highlights'
          ? { url: '', domain, highlights: [] }
          : { url: '', domain, summaries: [] };
      }
    } catch (error) {
      console.error('读取文件失败:', error);
      return null;
    }
  },

  // 写入文件
  async writeFile(type, domain, hash, data) {
    try {
      const domainHandle = await this.getDomainDir(domain, type);
      const fileName = `${hash}.json`;

      const fileHandle = await domainHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      return true;
    } catch (error) {
      console.error('写入文件失败:', error);
      return false;
    }
  },

  // 保存高亮
  async saveHighlight(url, highlight) {
    if (!this.baseDirHandle) {
      throw new Error('存储目录未初始化，请先选择存储位置');
    }

    const domain = this.getDomain(url);
    const hash = this.generateHash(url);

    // 读取现有数据
    const data = await this.readFile('highlights', domain, hash);
    data.url = url;
    data.domain = domain;

    if (!data.highlights) data.highlights = [];

    // 添加新的高亮
    const highlightWithMeta = {
      ...highlight,
      id: highlight.id || this.generateId(),
      createdAt: highlight.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.highlights.push(highlightWithMeta);
    data.lastUpdated = new Date().toISOString();

    // 写回文件
    await this.writeFile('highlights', domain, hash, data);

    // 同时更新 chrome.storage.local 作为缓存
    await this.syncToChromeStorage();

    return highlightWithMeta;
  },

  // 获取指定 URL 的所有高亮
  async getHighlights(url) {
    if (!this.baseDirHandle) {
      // 降级到 chrome.storage.local
      return this.getHighlightsFromChromeStorage(url);
    }

    const domain = this.getDomain(url);
    const hash = this.generateHash(url);
    const data = await this.readFile('highlights', domain, hash);

    // 返回高亮数组
    return data?.highlights || [];
  },

  // 从 chrome.storage.local 加载（降级方案）
  async getHighlightsFromChromeStorage(url) {
    const data = await chrome.storage.local.get('highlights');
    const highlights = data.highlights || {};
    return highlights[url] || [];
  },

  // 获取所有高亮
  async getAllHighlights() {
    if (!this.baseDirHandle) {
      return this.getAllHighlightsFromChromeStorage();
    }

    const result = {};
    const highlightsDir = await this.baseDirHandle.getDirectoryHandle('highlights');

    // 遍历所有域名目录
    for await (const domainEntry of highlightsDir.values()) {
      if (domainEntry.kind !== 'directory') continue;

      const domain = domainEntry.name;

      // 遍历该域名下的所有文件
      for await (const fileEntry of domainEntry.values()) {
        if (fileEntry.kind !== 'file' || !fileEntry.name.endsWith('.json')) continue;

        const fileHandle = await domainEntry.getFileHandle(fileEntry.name);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.url && data.highlights?.length > 0) {
          result[data.url] = data.highlights;
        }
      }
    }

    return result;
  },

  // 删除高亮
  async deleteHighlight(url, highlightId) {
    if (!this.baseDirHandle) {
      throw new Error('存储目录未初始化');
    }

    const domain = this.getDomain(url);
    const hash = this.generateHash(url);

    const data = await this.readFile('highlights', domain, hash);
    if (data.highlights) {
      data.highlights = data.highlights.filter(h => h.id !== highlightId);
      data.lastUpdated = new Date().toISOString();

      if (data.highlights.length === 0) {
        // 如果没有高亮了，删除文件
        await this.deleteFile('highlights', domain, hash);
      } else {
        await this.writeFile('highlights', domain, hash, data);
      }
    }

    await this.syncToChromeStorage();
  },

  // 更新高亮标注
  async updateHighlightAnnotation(url, highlightId, annotation) {
    if (!this.baseDirHandle) {
      throw new Error('存储目录未初始化');
    }

    const domain = this.getDomain(url);
    const hash = this.generateHash(url);

    const data = await this.readFile('highlights', domain, hash);
    if (data.highlights) {
      const highlight = data.highlights.find(h => h.id === highlightId);
      if (highlight) {
        highlight.annotation = annotation;
        highlight.updatedAt = new Date().toISOString();
        data.lastUpdated = new Date().toISOString();

        await this.writeFile('highlights', domain, hash, data);
        await this.syncToChromeStorage();

        return highlight;
      }
    }
    return null;
  },

  // 保存总结
  async saveSummary(summary) {
    if (!this.baseDirHandle) {
      throw new Error('存储目录未初始化');
    }

    const domain = this.getDomain(summary.url);
    const hash = this.generateHash(summary.url);

    const data = await this.readFile('summaries', domain, hash);
    data.url = summary.url;
    data.domain = domain;

    if (!data.summaries) data.summaries = [];

    const summaryWithMeta = {
      ...summary,
      id: summary.id || this.generateId(),
      createdAt: summary.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.summaries.push(summaryWithMeta);
    data.lastUpdated = new Date().toISOString();

    await this.writeFile('summaries', domain, hash, data);
    await this.syncToChromeStorage();

    return summaryWithMeta;
  },

  // 获取所有总结
  async getAllSummaries() {
    if (!this.baseDirHandle) {
      return this.getAllSummariesFromChromeStorage();
    }

    const result = {};
    const summariesDir = await this.baseDirHandle.getDirectoryHandle('summaries');

    for await (const domainEntry of summariesDir.values()) {
      if (domainEntry.kind !== 'directory') continue;

      const domain = domainEntry.name;

      for await (const fileEntry of domainEntry.values()) {
        if (fileEntry.kind !== 'file' || !fileEntry.name.endsWith('.json')) continue;

        const fileHandle = await domainEntry.getFileHandle(fileEntry.name);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.summaries) {
          data.summaries.forEach(s => {
            result[s.id] = s;
          });
        }
      }
    }

    return result;
  },

  // 获取指定 URL 的总结
  async getSummariesByUrl(url) {
    const summaries = await this.getAllSummaries();
    return Object.values(summaries).filter(s => s.url === url);
  },

  // 删除总结
  async deleteSummary(summaryId) {
    if (!this.baseDirHandle) {
      throw new Error('存储目录未初始化');
    }

    // 需要找到总结所在的文件
    const summariesDir = await this.baseDirHandle.getDirectoryHandle('summaries');

    for await (const domainEntry of summariesDir.values()) {
      if (domainEntry.kind !== 'directory') continue;

      for await (const fileEntry of domainEntry.values()) {
        if (fileEntry.kind !== 'file' || !fileEntry.name.endsWith('.json')) continue;

        const fileHandle = await domainEntry.getFileHandle(fileEntry.name);
        const file = await fileHandle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);

        if (data.summaries) {
          const initialLength = data.summaries.length;
          data.summaries = data.summaries.filter(s => s.id !== summaryId);

          if (data.summaries.length < initialLength) {
            data.lastUpdated = new Date().toISOString();

            if (data.summaries.length === 0) {
              await this.deleteFile('summaries', domainEntry.name, fileEntry.name.replace('.json', ''));
            } else {
              await this.writeFile('summaries', domainEntry.name, fileEntry.name.replace('.json', ''), data);
            }

            await this.syncToChromeStorage();
            return true;
          }
        }
      }
    }

    return false;
  },

  // 删除文件
  async deleteFile(type, domain, hash) {
    try {
      const parentDir = type === 'highlights' ? 'highlights' : 'summaries';
      const parentHandle = await this.baseDirHandle.getDirectoryHandle(parentDir);
      const domainHandle = await parentHandle.getDirectoryHandle(domain);
      const fileName = `${hash}.json`;

      await domainHandle.removeEntry(fileName);

      // 如果域名目录为空，也删除
      const entries = [];
      for await (const entry of domainHandle.values()) {
        entries.push(entry);
      }
      if (entries.length === 0) {
        await parentHandle.removeEntry(domain);
      }
    } catch (error) {
      console.error('删除文件失败:', error);
    }
  },

  // 生成唯一 ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // 同步到 chrome.storage.local（作为缓存和降级方案）
  async syncToChromeStorage() {
    try {
      const highlights = await this.getAllHighlights();
      const summaries = await this.getAllSummaries();
      await chrome.storage.local.set({ highlights, summaries });
    } catch (error) {
      console.error('同步到 chrome.storage 失败:', error);
    }
  },

  // 从 chrome.storage.local 加载（降级方案）
  async getHighlightsFromChromeStorage(url) {
    const data = await chrome.storage.local.get('highlights');
    const highlights = data.highlights || {};
    return highlights[url] || [];
  },

  async getAllHighlightsFromChromeStorage() {
    const data = await chrome.storage.local.get('highlights');
    return data.highlights || {};
  },

  async getAllSummariesFromChromeStorage() {
    const data = await chrome.storage.local.get('summaries');
    return data.summaries || {};
  },

  // 从 chrome.storage.local 迁移数据到文件系统
  async migrateFromChromeStorage() {
    try {
      const [highlights, summaries] = await Promise.all([
        chrome.storage.local.get('highlights'),
        chrome.storage.local.get('summaries')
      ]);

      let migratedCount = 0;

      // 迁移高亮
      if (highlights.highlights) {
        for (const [url, urlHighlights] of Object.entries(highlights.highlights)) {
          if (urlHighlights && urlHighlights.length > 0) {
            const domain = this.getDomain(url);
            const hash = this.generateHash(url);

            const data = {
              url,
              domain,
              highlights: urlHighlights,
              lastUpdated: new Date().toISOString()
            };

            await this.writeFile('highlights', domain, hash, data);
            migratedCount++;
          }
        }
      }

      // 迁移总结
      if (summaries.summaries) {
        for (const [id, summary] of Object.entries(summaries.summaries)) {
          if (summary && summary.url) {
            const domain = this.getDomain(summary.url);
            const hash = this.generateHash(summary.url);

            // 读取现有数据或创建新数据
            const data = await this.readFile('summaries', domain, hash);
            data.url = summary.url;
            data.domain = domain;

            if (!data.summaries) data.summaries = [];

            // 避免重复
            const existingIndex = data.summaries.findIndex(s => s.id === id);
            if (existingIndex >= 0) {
              data.summaries[existingIndex] = summary;
            } else {
              data.summaries.push(summary);
            }

            await this.writeFile('summaries', domain, hash, data);
            migratedCount++;
          }
        }
      }

      // 标记迁移完成
      await chrome.storage.local.set({ storageMigrated: true });

      return migratedCount;
    } catch (error) {
      console.error('数据迁移失败:', error);
      throw error;
    }
  },

  // 检查是否已初始化
  async isInitialized() {
    return !!this.baseDirHandle;
  },

  // 获取存储状态
  async getStorageStatus() {
    const isFs = !!this.baseDirHandle;
    const hasData = isFs || !!(await chrome.storage.local.get('storageMigrated')).storageMigrated;

    return {
      type: isFs ? 'filesystem' : 'chrome_storage',
      initialized: isFs,
      hasData
    };
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.FsStorage = FsStorage;
}
