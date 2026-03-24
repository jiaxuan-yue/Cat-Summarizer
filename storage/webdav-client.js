// WebDAV Client - WebDAV 客户端模块

const WebDAVClient = {
  // 配置
  config: {
    enabled: false,
    serverUrl: '',
    username: '',
    password: '',
    remotePath: '/notes'  // 远程存储路径
  },

  // 初始化，加载配置
  async init() {
    const result = await chrome.storage.local.get([
      'webdavEnabled',
      'webdavServerUrl',
      'webdavUsername',
      'webdavPassword',
      'webdavRemotePath'
    ]);

    this.config.enabled = result.webdavEnabled || false;
    this.config.serverUrl = result.webdavServerUrl || '';
    this.config.username = result.webdavUsername || '';
    this.config.password = result.webdavPassword || '';
    this.config.remotePath = result.webdavRemotePath || '/notes';

    return this.config.enabled;
  },

  // 更新配置
  async updateConfig(newConfig) {
    const updateData = {};
    if (newConfig.enabled !== undefined) {
      this.config.enabled = newConfig.enabled;
      updateData.webdavEnabled = newConfig.enabled;
    }
    if (newConfig.serverUrl !== undefined) {
      this.config.serverUrl = newConfig.serverUrl;
      updateData.webdavServerUrl = newConfig.serverUrl;
    }
    if (newConfig.username !== undefined) {
      this.config.username = newConfig.username;
      updateData.webdavUsername = newConfig.username;
    }
    if (newConfig.password !== undefined) {
      this.config.password = newConfig.password;
      updateData.webdavPassword = newConfig.password;
    }
    if (newConfig.remotePath !== undefined) {
      this.config.remotePath = newConfig.remotePath;
      updateData.webdavRemotePath = newConfig.remotePath;
    }

    await chrome.storage.local.set(updateData);
    return this.config;
  },

  // 获取基础 URL
  getBaseUrl() {
    let url = this.config.serverUrl;
    if (!url) return null;

    // 确保 URL 格式正确
    url = url.replace(/\/+$/, '');  // 移除末尾的斜杠
    return url;
  },

  // 构建认证头
  getAuthHeader() {
    const credentials = btoa(`${this.config.username}:${this.config.password}`);
    return `Basic ${credentials}`;
  },

  // 发送 WebDAV 请求
  async request(path, options = {}) {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error('WebDAV 服务器地址未配置');
    }

    const url = `${baseUrl}${path}`;

    const headers = {
      ...options.headers,
      'Authorization': this.getAuthHeader()
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`WebDAV 请求失败：${response.status} ${response.statusText}`);
      }

      return response;
    } catch (error) {
      console.error('WebDAV 请求错误:', error);
      throw error;
    }
  },

  // 测试连接
  async testConnection() {
    try {
      // 尝试列出远程目录
      const response = await this.request(this.config.remotePath, {
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

      const text = await response.text();
      return {
        success: true,
        message: '连接成功',
        response: text
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  },

  // 确保远程目录存在
  async ensureRemoteDir() {
    try {
      // 先尝试创建目录（如果已存在会返回 405 或 201）
      const response = await this.request(this.config.remotePath, {
        method: 'MKCOL'
      });
      return response.ok;
    } catch (error) {
      // 405 Method Not Allowed 表示目录已存在
      if (error.message.includes('405')) {
        return true;
      }
      throw error;
    }
  },

  // 上传文件
  async uploadFile(localPath, content) {
    if (!this.config.enabled) return false;

    try {
      const remotePath = `${this.config.remotePath}/${localPath}`;

      await this.request(remotePath, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      });

      return true;
    } catch (error) {
      console.error('上传文件失败:', error);
      return false;
    }
  },

  // 下载文件
  async downloadFile(localPath) {
    if (!this.config.enabled) return null;

    try {
      const remotePath = `${this.config.remotePath}/${localPath}`;

      const response = await this.request(remotePath, {
        method: 'GET'
      });

      const text = await response.text();
      return JSON.parse(text);
    } catch (error) {
      // 文件不存在返回 null
      if (error.message.includes('404')) {
        return null;
      }
      console.error('下载文件失败:', error);
      return null;
    }
  },

  // 删除文件
  async deleteFile(localPath) {
    if (!this.config.enabled) return false;

    try {
      const remotePath = `${this.config.remotePath}/${localPath}`;

      await this.request(remotePath, {
        method: 'DELETE'
      });

      return true;
    } catch (error) {
      console.error('删除文件失败:', error);
      return false;
    }
  },

  // 列出远程文件
  async listFiles() {
    if (!this.config.enabled) return [];

    try {
      const response = await this.request(this.config.remotePath, {
        method: 'PROPFIND',
        headers: {
          'Depth': 'infinity'
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
          <d:propfind xmlns:d="DAV:">
            <d:prop>
              <d:displayname/>
              <d:getlastmodified/>
              <d:getcontentlength/>
              <d:resourcetype/>
            </d:prop>
          </d:propfind>`
      });

      const text = await response.text();
      return this.parsePropfindResponse(text);
    } catch (error) {
      console.error('列出文件失败:', error);
      return [];
    }
  },

  // 解析 PROPFIND 响应
  parsePropfindResponse(xml) {
    const files = [];
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xml, 'text/xml');
    const responses = xmlDoc.getElementsByTagName('d:response');

    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      const href = response.getElementsByTagName('d:href')[0];
      const displayName = response.getElementsByTagName('d:displayname')[0];
      const resourceType = response.getElementsByTagName('d:resourcetype')[0];

      if (href && resourceType.children.length === 0) {  // 文件（不是目录）
        files.push({
          path: href.textContent,
          name: displayName ? displayName.textContent : href.textContent.split('/').pop()
        });
      }
    }

    return files;
  },

  // 同步：上传本地文件到 WebDAV
  async syncUpload(localPath, content) {
    if (!this.config.enabled) return false;

    try {
      await this.ensureRemoteDir();
      return await this.uploadFile(localPath, content);
    } catch (error) {
      console.error('同步上传失败:', error);
      return false;
    }
  },

  // 同步：从 WebDAV 下载文件
  async syncDownload(localPath) {
    if (!this.config.enabled) return null;

    try {
      return await this.downloadFile(localPath);
    } catch (error) {
      return null;
    }
  },

  // 获取远程文件的最后修改时间
  async getRemoteFileMtime(localPath) {
    if (!this.config.enabled) return null;

    try {
      const remotePath = `${this.config.remotePath}/${localPath}`;

      const response = await this.request(remotePath, {
        method: 'PROPFIND',
        headers: {
          'Depth': '0'
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
          <d:propfind xmlns:d="DAV:">
            <d:prop>
              <d:getlastmodified/>
            </d:prop>
          </d:propfind>`
      });

      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'text/xml');
      const mtime = xmlDoc.getElementsByTagName('d:getlastmodified')[0];

      return mtime ? mtime.textContent : null;
    } catch (error) {
      return null;
    }
  },

  // 检查是否启用
  isEnabled() {
    return this.config.enabled && !!this.config.serverUrl;
  }
};

// 导出
if (typeof window !== 'undefined') {
  window.WebDAVClient = WebDAVClient;
}
