// Options Page Script

document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('provider');
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  const saveBtn = document.getElementById('saveBtn');
  const messageDiv = document.getElementById('message');

  // WebDAV 相关元素
  const webdavEnabledCheckbox = document.getElementById('webdavEnabled');
  const webdavConfigDiv = document.getElementById('webdavConfig');
  const testWebdavBtn = document.getElementById('testWebdavBtn');
  const saveWebdavBtn = document.getElementById('saveWebdavBtn');

  // 存储管理相关元素
  const selectStorageDirBtn = document.getElementById('selectStorageDirBtn');
  const migrateDataBtn = document.getElementById('migrateDataBtn');
  const storageStatusDiv = document.getElementById('storageStatus');
  const migrateMessageDiv = document.getElementById('migrateMessage');

  // 监听提供商选择变化
  providerSelect.addEventListener('change', () => {
    const provider = providerSelect.value;
    // builtin 模式不需要 API Key
    if (apiKeyGroup) {
      apiKeyGroup.style.display = provider === 'builtin' ? 'none' : 'block';
    }
  });

  // 监听 WebDAV 启用状态变化
  if (webdavEnabledCheckbox) {
    webdavEnabledCheckbox.addEventListener('change', () => {
      if (webdavConfigDiv) {
        webdavConfigDiv.classList.toggle('show', webdavEnabledCheckbox.checked);
      }
    });
  }

  // 测试 WebDAV 连接
  if (testWebdavBtn) {
    testWebdavBtn.addEventListener('click', testWebDAVConnection);
  }

  // 保存 WebDAV 配置
  if (saveWebdavBtn) {
    saveWebdavBtn.addEventListener('click', saveWebDAVConfig);
  }

  // 选择存储目录
  if (selectStorageDirBtn) {
    selectStorageDirBtn.addEventListener('click', selectStorageDirectory);
  }

  // 迁移数据
  if (migrateDataBtn) {
    migrateDataBtn.addEventListener('click', migrateData);
  }

  // 加载已保存的配置
  loadSettings();
  loadWebDAVSettings();
  loadStorageStatus();

  // 保存按钮点击
  saveBtn.addEventListener('click', saveSettings);
});

// 加载设置
async function loadSettings() {
  const result = await chrome.storage.local.get(['provider', 'apiKey']);

  if (result.provider) {
    const providerSelect = document.getElementById('provider');
    providerSelect.value = result.provider;
    // 触发 change 事件以更新 UI
    providerSelect.dispatchEvent(new Event('change'));
  }

  if (result.apiKey) {
    document.getElementById('apiKey').value = result.apiKey;
  }
}

// 保存设置
async function saveSettings() {
  const provider = document.getElementById('provider').value;
  const apiKey = document.getElementById('apiKey').value.trim();
  const messageDiv = document.getElementById('message');

  // builtin 模式不需要 API Key
  if (provider !== 'builtin' && !apiKey) {
    messageDiv.textContent = '请输入 API Key';
    messageDiv.className = 'message error';
    return;
  }

  await chrome.storage.local.set({ provider, apiKey: provider === 'builtin' ? '' : apiKey });

  messageDiv.textContent = '设置已保存';
  messageDiv.className = 'message success';
}

// 加载 WebDAV 设置
async function loadWebDAVSettings() {
  const result = await chrome.storage.local.get([
    'webdavEnabled',
    'webdavServerUrl',
    'webdavUsername',
    'webdavPassword',
    'webdavRemotePath'
  ]);

  const webdavEnabledCheckbox = document.getElementById('webdavEnabled');
  const webdavConfigDiv = document.getElementById('webdavConfig');

  if (webdavEnabledCheckbox) {
    webdavEnabledCheckbox.checked = result.webdavEnabled || false;
  }

  if (webdavConfigDiv) {
    webdavConfigDiv.classList.toggle('show', result.webdavEnabled || false);
  }

  if (result.webdavServerUrl) {
    document.getElementById('webdavServerUrl').value = result.webdavServerUrl;
  }

  if (result.webdavUsername) {
    document.getElementById('webdavUsername').value = result.webdavUsername;
  }

  if (result.webdavPassword) {
    document.getElementById('webdavPassword').value = result.webdavPassword;
  }

  if (result.webdavRemotePath) {
    document.getElementById('webdavRemotePath').value = result.webdavRemotePath;
  }
}

// 保存 WebDAV 配置
async function saveWebDAVConfig() {
  const webdavEnabledCheckbox = document.getElementById('webdavEnabled');
  const serverUrl = document.getElementById('webdavServerUrl').value.trim();
  const username = document.getElementById('webdavUsername').value.trim();
  const password = document.getElementById('webdavPassword').value.trim();
  const remotePath = document.getElementById('webdavRemotePath').value.trim() || '/notes';
  const webdavMessageDiv = document.getElementById('webdavMessage');

  const enabled = webdavEnabledCheckbox?.checked || false;

  if (enabled && !serverUrl) {
    webdavMessageDiv.textContent = '请输入 WebDAV 服务器地址';
    webdavMessageDiv.className = 'message error';
    return;
  }

  if (enabled && !username) {
    webdavMessageDiv.textContent = '请输入用户名';
    webdavMessageDiv.className = 'message error';
    return;
  }

  if (enabled && !password) {
    webdavMessageDiv.textContent = '请输入密码';
    webdavMessageDiv.className = 'message error';
    return;
  }

  await chrome.storage.local.set({
    webdavEnabled: enabled,
    webdavServerUrl: serverUrl,
    webdavUsername: username,
    webdavPassword: password,
    webdavRemotePath: remotePath
  });

  webdavMessageDiv.textContent = 'WebDAV 配置已保存';
  webdavMessageDiv.className = 'message success';
}

// 测试 WebDAV 连接
async function testWebDAVConnection() {
  const serverUrl = document.getElementById('webdavServerUrl').value.trim();
  const username = document.getElementById('webdavUsername').value.trim();
  const password = document.getElementById('webdavPassword').value.trim();
  const remotePath = document.getElementById('webdavRemotePath').value.trim() || '/notes';
  const webdavMessageDiv = document.getElementById('webdavMessage');

  if (!serverUrl) {
    webdavMessageDiv.textContent = '请输入 WebDAV 服务器地址';
    webdavMessageDiv.className = 'message error';
    return;
  }

  if (!username || !password) {
    webdavMessageDiv.textContent = '请输入用户名和密码';
    webdavMessageDiv.className = 'message error';
    return;
  }

  webdavMessageDiv.textContent = '正在测试连接...';
  webdavMessageDiv.className = 'message';

  try {
    // 使用 WebDAVClient 进行测试
    const testClient = {
      config: { serverUrl, username, password, remotePath },
      getBaseUrl: function() { return this.config.serverUrl.replace(/\/+$/, ''); },
      getAuthHeader: function() { return 'Basic ' + btoa(this.config.username + ':' + this.config.password); },
      request: async function(path, options = {}) {
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}${path}`;
        const headers = {
          ...options.headers,
          'Authorization': this.getAuthHeader()
        };
        const response = await fetch(url, { ...options, headers });
        if (!response.ok) {
          throw new Error(`请求失败：${response.status} ${response.statusText}`);
        }
        return response;
      },
      testConnection: async function() {
        try {
          await this.request(this.config.remotePath, {
            method: 'PROPFIND',
            headers: {
              'Depth': '1'
            },
            body: `<?xml version="1.0" encoding="utf-8"?>
              <d:propfind xmlns:d="DAV:">
                <d:prop>
                  <d:displayname/>
                  <d:resourcetype/>
                </d:prop>
              </d:propfind>`
          });
          return { success: true, message: '连接成功' };
        } catch (error) {
          return { success: false, message: error.message };
        }
      }
    };

    const result = await testClient.testConnection();

    if (result.success) {
      webdavMessageDiv.textContent = '连接成功！';
      webdavMessageDiv.className = 'message success';
    } else {
      webdavMessageDiv.textContent = `连接失败：${result.message}`;
      webdavMessageDiv.className = 'message error';
    }
  } catch (error) {
    webdavMessageDiv.textContent = `连接失败：${error.message}`;
    webdavMessageDiv.className = 'message error';
  }
}

// 选择存储目录
async function selectStorageDirectory() {
  const storageStatusDiv = document.getElementById('storageStatus');
  const migrateMessageDiv = document.getElementById('migrateMessage');

  try {
    // 请求用户选择目录
    const dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });

    // 保存句柄
    await chrome.storage.local.set({ storageDirHandle: dirHandle });

    // 初始化目录结构
    await dirHandle.getDirectoryHandle('highlights', { create: true });
    await dirHandle.getDirectoryHandle('summaries', { create: true });

    storageStatusDiv.textContent = '存储目录已设置：' + dirHandle.name;
    migrateMessageDiv.textContent = '存储目录设置成功！';
    migrateMessageDiv.className = 'message success';
  } catch (error) {
    if (error.name === 'AbortError') {
      storageStatusDiv.textContent = '用户取消选择';
    } else {
      storageStatusDiv.textContent = '设置失败：' + error.message;
      migrateMessageDiv.textContent = '设置存储目录失败：' + error.message;
      migrateMessageDiv.className = 'message error';
    }
  }
}

// 迁移数据
async function migrateData() {
  const migrateMessageDiv = document.getElementById('migrateMessage');
  const storageStatusDiv = document.getElementById('storageStatus');

  migrateMessageDiv.textContent = '正在迁移数据...';
  migrateMessageDiv.className = 'message';

  try {
    // 检查是否已选择存储目录
    const result = await chrome.storage.local.get('storageDirHandle');
    if (!result.storageDirHandle) {
      migrateMessageDiv.textContent = '请先选择存储目录';
      migrateMessageDiv.className = 'message error';
      return;
    }

    // 获取现有数据
    const [highlightsData, summariesData] = await Promise.all([
      chrome.storage.local.get('highlights'),
      chrome.storage.local.get('summaries')
    ]);

    const highlights = highlightsData.highlights || {};
    const summaries = summariesData.summaries || {};

    let migratedCount = 0;
    const dirHandle = result.storageDirHandle;

    // 辅助函数：生成 hash
    const generateHash = (url) => {
      let hash = 0;
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36).padStart(8, '0');
    };

    // 辅助函数：获取域名
    const getDomain = (url) => {
      try {
        return new URL(url).hostname;
      } catch (e) {
        return 'unknown';
      }
    };

    // 迁移高亮
    for (const [url, urlHighlights] of Object.entries(highlights)) {
      if (urlHighlights && urlHighlights.length > 0) {
        const domain = getDomain(url);
        const hash = generateHash(url);

        const domainHandle = await dirHandle.getDirectoryHandle('highlights', { create: true })
          .then(h => h.getDirectoryHandle(domain, { create: true }));

        const fileHandle = await domainHandle.getFileHandle(`${hash}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify({
          url,
          domain,
          highlights: urlHighlights,
          lastUpdated: new Date().toISOString()
        }, null, 2));
        await writable.close();

        migratedCount++;
      }
    }

    // 迁移总结
    for (const [id, summary] of Object.entries(summaries)) {
      if (summary && summary.url) {
        const domain = getDomain(summary.url);
        const hash = generateHash(summary.url);

        const domainHandle = await dirHandle.getDirectoryHandle('summaries', { create: true })
          .then(h => h.getDirectoryHandle(domain, { create: true }));

        // 读取现有数据或创建新数据
        let data = { url: summary.url, domain, summaries: [] };
        try {
          const fileHandle = await domainHandle.getFileHandle(`${hash}.json`);
          const file = await fileHandle.getFile();
          const text = await file.text();
          data = JSON.parse(text);
        } catch (e) {
          // 文件不存在，使用默认值
        }

        if (!data.summaries) data.summaries = [];

        // 避免重复
        const existingIndex = data.summaries.findIndex(s => s.id === id);
        if (existingIndex >= 0) {
          data.summaries[existingIndex] = summary;
        } else {
          data.summaries.push(summary);
        }

        const fileHandle = await domainHandle.getFileHandle(`${hash}.json`, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(JSON.stringify({
          ...data,
          lastUpdated: new Date().toISOString()
        }, null, 2));
        await writable.close();

        migratedCount++;
      }
    }

    // 标记迁移完成
    await chrome.storage.local.set({ storageMigrated: true });

    migrateMessageDiv.textContent = `迁移完成！共迁移 ${migratedCount} 条数据`;
    migrateMessageDiv.className = 'message success';
    storageStatusDiv.textContent = '数据来源：文件系统（已迁移）';

  } catch (error) {
    migrateMessageDiv.textContent = '迁移失败：' + error.message;
    migrateMessageDiv.className = 'message error';
  }
}

// 加载存储状态
async function loadStorageStatus() {
  const storageStatusDiv = document.getElementById('storageStatus');

  try {
    const result = await chrome.storage.local.get(['storageDirHandle', 'storageMigrated']);

    if (result.storageDirHandle) {
      storageStatusDiv.textContent = '存储类型：文件系统';
    } else if (result.storageMigrated) {
      storageStatusDiv.textContent = '数据来源：文件系统（已迁移）';
    } else {
      storageStatusDiv.textContent = '存储类型：Chrome 本地存储';
    }
  } catch (error) {
    storageStatusDiv.textContent = '无法获取存储状态';
  }
}
