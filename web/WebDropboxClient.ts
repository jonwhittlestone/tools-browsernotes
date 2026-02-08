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

/**
 * Thin client that calls the backend /api/dropbox/* endpoints.
 * All Dropbox tokens are managed server-side.
 */
export class WebDropboxClient {
  async getStatus(): Promise<DropboxStatus> {
    const resp = await fetch('/api/dropbox/status');
    if (!resp.ok) throw new Error(`Status failed: ${resp.status}`);
    return resp.json();
  }

  async listEntries(path: string = ''): Promise<DropboxEntry[]> {
    const resp = await fetch('/api/dropbox/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (!resp.ok) throw new Error(`List failed: ${resp.status}`);
    const data = await resp.json();
    return data.entries;
  }

  async readFile(path: string): Promise<DropboxFileResult> {
    const resp = await fetch('/api/dropbox/read', {
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
    const resp = await fetch('/api/dropbox/write', {
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
    const resp = await fetch('/api/dropbox/metadata', {
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
    await fetch('/api/dropbox/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  }

  async disconnect(): Promise<void> {
    await fetch('/api/dropbox/disconnect', { method: 'POST' });
  }

  initiateAuth(): void {
    window.location.href = '/api/dropbox/auth';
  }
}
