export interface DropboxStatus {
  connected: boolean;
  file_path: string | null;
  auto_sync: boolean;
  sync_frequency: number;
}

export interface DropboxEntry {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  rev?: string;
}

export interface DropboxFileResult {
  content: string;
  rev?: string;
}

export interface DropboxWriteResult {
  id: string;
  name: string;
  path: string;
  rev: string;
}

declare global {
  interface Window {
    __BASE_PATH__?: string;
  }
}

function basePath(): string {
  return window.__BASE_PATH__ || '';
}

/**
 * Thin client that calls the backend /api/dropbox/* endpoints.
 * All Dropbox tokens are managed server-side.
 */
export class WebDropboxClient {
  async getStatus(): Promise<DropboxStatus> {
    const resp = await fetch(`${basePath()}/api/dropbox/status`);
    if (!resp.ok) throw new Error(`Status failed: ${resp.status}`);
    return resp.json();
  }

  async listEntries(path: string = ''): Promise<DropboxEntry[]> {
    const resp = await fetch(`${basePath()}/api/dropbox/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!resp.ok) throw new Error(`List failed: ${resp.status}`);
    const data = await resp.json();
    return data.entries;
  }

  async readFile(path: string): Promise<DropboxFileResult> {
    const resp = await fetch(`${basePath()}/api/dropbox/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!resp.ok) throw new Error(`Read failed: ${resp.status}`);
    return resp.json();
  }

  async writeFile(
    path: string,
    content: string,
    rev?: string,
  ): Promise<DropboxWriteResult> {
    const resp = await fetch(`${basePath()}/api/dropbox/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content, rev }),
    });
    if (resp.status === 409) {
      throw new Error('FILE_CONFLICT');
    }
    if (!resp.ok) throw new Error(`Write failed: ${resp.status}`);
    return resp.json();
  }

  async getMetadata(
    path: string,
  ): Promise<{ id: string; name: string; path: string; rev: string } | null> {
    const resp = await fetch(`${basePath()}/api/dropbox/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!resp.ok) return null;
    return resp.json();
  }

  async saveConfig(config: {
    filePath?: string;
    autoSync?: boolean;
    syncFrequency?: number;
  }): Promise<void> {
    await fetch(`${basePath()}/api/dropbox/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  async disconnect(): Promise<void> {
    await fetch(`${basePath()}/api/dropbox/disconnect`, { method: 'POST' });
  }

  initiateAuth(): void {
    window.location.href = `${basePath()}/api/dropbox/auth`;
  }

  // --- Remarkable Sync ---

  async getRemarkableStatus(): Promise<RemarkableSyncStatus> {
    const resp = await fetch(`${basePath()}/api/remarkable/status`);
    if (!resp.ok) throw new Error(`Remarkable status failed: ${resp.status}`);
    return resp.json();
  }

  async saveRemarkableConfig(config: Partial<RemarkableSyncConfig>): Promise<void> {
    await fetch(`${basePath()}/api/remarkable/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  async triggerRemarkableSync(): Promise<RemarkableSyncResult> {
    const resp = await fetch(`${basePath()}/api/remarkable/sync`, {
      method: 'POST',
    });
    if (!resp.ok) throw new Error(`Remarkable sync failed: ${resp.status}`);
    return resp.json();
  }

  async getRemarkableSyncLog(): Promise<SyncLogEntry[]> {
    const resp = await fetch(`${basePath()}/api/remarkable/log`);
    if (!resp.ok) throw new Error(`Remarkable log failed: ${resp.status}`);
    const data = await resp.json();
    return data.entries;
  }
}

export interface RemarkableSyncStatus {
  enabled: boolean;
  source_folder: string;
  dest_folder: string;
  poll_interval_seconds: number;
  last_sync: string | null;
  recent_syncs: SyncLogEntry[];
}

export interface RemarkableSyncConfig {
  enabled: boolean;
  source_folder: string;
  dest_folder: string;
  poll_interval_seconds: number;
}

export interface RemarkableSyncResult {
  files_copied: number;
  files_skipped: number;
  errors: string[];
  details: { file_name: string; status: string; size_bytes?: number; error?: string }[];
}

export interface SyncLogEntry {
  timestamp: string;
  file_name: string;
  source_path: string;
  dest_path: string;
  status: 'copied' | 'skipped' | 'error';
  size_bytes: number;
  error?: string;
}
