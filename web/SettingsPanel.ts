import { WebDropboxClient, DropboxStatus, RemarkableSyncStatus } from './WebDropboxClient';

export interface SettingsPanelOptions {
  dropbox: WebDropboxClient;
  onSettingsChange: (settings: WebSettings) => void;
}

export interface WebSettings {
  vimEnabled: boolean;
  autoSync: boolean;
  syncFrequency: number;
}

export class SettingsPanel {
  private panel: HTMLElement;
  private overlay: HTMLElement;
  private dropbox: WebDropboxClient;
  private onSettingsChange: (settings: WebSettings) => void;
  private isOpen: boolean = false;

  constructor(options: SettingsPanelOptions) {
    this.dropbox = options.dropbox;
    this.onSettingsChange = options.onSettingsChange;
    this.overlay = this.createOverlay();
    this.panel = this.createPanel();
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);
  }

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';
    overlay.addEventListener('click', () => this.close());
    return overlay;
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.innerHTML = `
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="settings-close">&times;</button>
      </div>
      <div class="settings-body">
        <section class="settings-section">
          <h3>Dropbox</h3>
          <div id="dropboxStatus" class="settings-status">Checking...</div>
          <div id="dropboxActions"></div>
          <div id="fileBrowser" style="display:none">
            <div class="settings-field">
              <label>Current Path</label>
              <div id="breadcrumbs" class="breadcrumbs"></div>
            </div>
            <div id="folderList" class="folder-list"></div>
            <div class="settings-field">
              <label>Select File</label>
              <select id="fileSelect" class="settings-select">
                <option value="">-- Select a file --</option>
              </select>
            </div>
          </div>
        </section>
        <section class="settings-section">
          <h3>Sync</h3>
          <div class="settings-field">
            <label>
              <input type="checkbox" id="autoSyncToggle" />
              Auto-sync
            </label>
          </div>
          <div class="settings-field">
            <label>Sync Frequency</label>
            <select id="syncFrequency" class="settings-select">
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
              <option value="15">15 seconds</option>
              <option value="30" selected>30 seconds</option>
              <option value="60">60 seconds</option>
              <option value="120">120 seconds</option>
            </select>
          </div>
        </section>
        <section class="settings-section" id="remarkableSection" style="display:none">
          <h3>reMarkable Sync</h3>
          <div class="settings-field">
            <label>
              <input type="checkbox" id="remarkableToggle" />
              Enable sync
            </label>
          </div>
          <div class="settings-field">
            <label>
              <input type="checkbox" id="remarkableOcrToggle" />
              Enable OCR
            </label>
          </div>
          <div class="settings-field">
            <label>Source folder</label>
            <input type="text" id="remarkableSource" class="settings-input" placeholder="/Email Attachments" />
          </div>
          <div class="settings-field">
            <label>Destination folder</label>
            <input type="text" id="remarkableDest" class="settings-input" placeholder="/DropsyncFiles/jw-mind/..." />
          </div>
          <div class="settings-field">
            <label>Poll interval</label>
            <select id="remarkableInterval" class="settings-select">
              <option value="60">1 minute</option>
              <option value="300" selected>5 minutes</option>
              <option value="600">10 minutes</option>
              <option value="900">15 minutes</option>
              <option value="1800">30 minutes</option>
            </select>
          </div>
          <div class="settings-field" style="display:flex;gap:8px">
            <button class="settings-btn primary" id="remarkableSyncNow">Sync Now</button>
            <button class="settings-btn" id="remarkableSaveConfig">Save</button>
          </div>
          <div id="remarkableSyncResult" class="remarkable-sync-result" style="display:none"></div>
          <div id="remarkableLog" class="remarkable-log"></div>
        </section>
        <section class="settings-section">
          <h3>Editor</h3>
          <div class="settings-field">
            <label>
              <input type="checkbox" id="vimToggle" />
              Vim Mode (desktop only)
            </label>
          </div>
        </section>
      </div>
    `;

    panel.querySelector('.settings-close')!.addEventListener('click', () =>
      this.close(),
    );

    // Setting change handlers
    panel.querySelector('#autoSyncToggle')!.addEventListener('change', () =>
      this.saveSettings(),
    );
    panel.querySelector('#syncFrequency')!.addEventListener('change', () =>
      this.saveSettings(),
    );
    panel.querySelector('#vimToggle')!.addEventListener('change', () =>
      this.saveSettings(),
    );

    panel.querySelector('#remarkableToggle')!.addEventListener('change', () =>
      this.saveRemarkableConfig(),
    );
    panel.querySelector('#remarkableOcrToggle')!.addEventListener('change', () =>
      this.saveRemarkableConfig(),
    );
    panel.querySelector('#remarkableSyncNow')!.addEventListener('click', () =>
      this.triggerRemarkableSync(),
    );
    panel.querySelector('#remarkableSaveConfig')!.addEventListener('click', () =>
      this.saveRemarkableConfig(),
    );

    return panel;
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.overlay.classList.add('visible');
    this.panel.classList.add('visible');
    this.loadSettings();
    await this.refreshDropboxStatus();
    await this.refreshRemarkableStatus();
  }

  close(): void {
    this.isOpen = false;
    this.overlay.classList.remove('visible');
    this.panel.classList.remove('visible');
  }

  private loadSettings(): void {
    const vim = this.panel.querySelector('#vimToggle') as HTMLInputElement;
    const autoSync = this.panel.querySelector(
      '#autoSyncToggle',
    ) as HTMLInputElement;
    const syncFreq = this.panel.querySelector(
      '#syncFrequency',
    ) as HTMLSelectElement;

    vim.checked = localStorage.getItem('vimEnabled') === 'true';
    autoSync.checked = localStorage.getItem('autoSync') !== 'false';
    syncFreq.value = localStorage.getItem('syncFrequency') || '30';
  }

  private saveSettings(): void {
    const vim = (this.panel.querySelector('#vimToggle') as HTMLInputElement)
      .checked;
    const autoSync = (
      this.panel.querySelector('#autoSyncToggle') as HTMLInputElement
    ).checked;
    const syncFrequency = parseInt(
      (this.panel.querySelector('#syncFrequency') as HTMLSelectElement).value,
    );

    localStorage.setItem('vimEnabled', String(vim));
    localStorage.setItem('autoSync', String(autoSync));
    localStorage.setItem('syncFrequency', String(syncFrequency));

    this.onSettingsChange({ vimEnabled: vim, autoSync, syncFrequency });
  }

  private async refreshDropboxStatus(): Promise<void> {
    const statusEl = this.panel.querySelector('#dropboxStatus') as HTMLElement;
    const actionsEl = this.panel.querySelector('#dropboxActions') as HTMLElement;
    const browserEl = this.panel.querySelector('#fileBrowser') as HTMLElement;

    try {
      const status: DropboxStatus = await this.dropbox.getStatus();

      if (status.connected) {
        statusEl.textContent = 'Connected';
        statusEl.className = 'settings-status connected';
        actionsEl.innerHTML = `
          <button class="settings-btn danger" id="disconnectBtn">Disconnect</button>
        `;
        actionsEl
          .querySelector('#disconnectBtn')!
          .addEventListener('click', () => this.disconnectDropbox());

        browserEl.style.display = 'block';
        await this.loadFileBrowser(status.file_path || '/');
      } else {
        statusEl.textContent = 'Not connected';
        statusEl.className = 'settings-status disconnected';
        actionsEl.innerHTML = `
          <button class="settings-btn primary" id="connectBtn">Connect to Dropbox</button>
        `;
        actionsEl
          .querySelector('#connectBtn')!
          .addEventListener('click', () => this.connectDropbox());
        browserEl.style.display = 'none';
      }
    } catch {
      statusEl.textContent = 'Error checking status';
      statusEl.className = 'settings-status error';
    }
  }

  private async connectDropbox(): Promise<void> {
    this.dropbox.initiateAuth();
  }

  private async disconnectDropbox(): Promise<void> {
    await this.dropbox.disconnect();
    await this.refreshDropboxStatus();
  }

  private currentBrowsePath: string = '/';

  private async loadFileBrowser(filePath: string): Promise<void> {
    // Extract directory from file path
    const pathParts = filePath.split('/');
    if (filePath.endsWith('.md')) {
      pathParts.pop();
    }
    this.currentBrowsePath = pathParts.join('/') || '/';

    await this.refreshFolderContents();
  }

  private async refreshFolderContents(): Promise<void> {
    const breadcrumbsEl = this.panel.querySelector('#breadcrumbs') as HTMLElement;
    const folderListEl = this.panel.querySelector('#folderList') as HTMLElement;
    const fileSelectEl = this.panel.querySelector(
      '#fileSelect',
    ) as HTMLSelectElement;

    // Update breadcrumbs
    const parts = this.currentBrowsePath.split('/').filter(Boolean);
    breadcrumbsEl.innerHTML = '';
    const rootCrumb = document.createElement('span');
    rootCrumb.className = 'breadcrumb';
    rootCrumb.textContent = 'Root';
    rootCrumb.addEventListener('click', () => this.navigateTo('/'));
    breadcrumbsEl.appendChild(rootCrumb);

    let buildPath = '';
    for (const part of parts) {
      buildPath += '/' + part;
      const separator = document.createElement('span');
      separator.textContent = ' / ';
      separator.className = 'breadcrumb-sep';
      breadcrumbsEl.appendChild(separator);

      const crumb = document.createElement('span');
      crumb.className = 'breadcrumb';
      crumb.textContent = part;
      const navPath = buildPath;
      crumb.addEventListener('click', () => this.navigateTo(navPath));
      breadcrumbsEl.appendChild(crumb);
    }

    try {
      const entries = await this.dropbox.listEntries(this.currentBrowsePath);

      // Folders
      const folders = entries.filter((e) => e.type === 'folder');
      folderListEl.innerHTML = '';
      for (const folder of folders) {
        const folderEl = document.createElement('div');
        folderEl.className = 'folder-item';
        folderEl.textContent = '\uD83D\uDCC1 ' + folder.name;
        folderEl.addEventListener('click', () =>
          this.navigateTo(folder.path),
        );
        folderListEl.appendChild(folderEl);
      }

      // Files (.md only)
      const files = entries.filter(
        (e) => e.type === 'file' && e.name.endsWith('.md'),
      );
      fileSelectEl.innerHTML =
        '<option value="">-- Select a file --</option>';
      for (const file of files) {
        const opt = document.createElement('option');
        opt.value = file.path;
        opt.textContent = file.name;
        fileSelectEl.appendChild(opt);
      }

      // Wire up file selection
      fileSelectEl.onchange = () => {
        const selected = fileSelectEl.value;
        if (selected) {
          this.selectFile(selected);
        }
      };
    } catch (error) {
      folderListEl.innerHTML =
        '<div class="settings-error">Failed to load files</div>';
    }
  }

  private async refreshRemarkableStatus(): Promise<void> {
    const section = this.panel.querySelector('#remarkableSection') as HTMLElement;
    try {
      const status: RemarkableSyncStatus = await this.dropbox.getRemarkableStatus();
      section.style.display = 'block';

      const toggle = this.panel.querySelector('#remarkableToggle') as HTMLInputElement;
      const ocrToggle = this.panel.querySelector('#remarkableOcrToggle') as HTMLInputElement;
      const source = this.panel.querySelector('#remarkableSource') as HTMLInputElement;
      const dest = this.panel.querySelector('#remarkableDest') as HTMLInputElement;
      const interval = this.panel.querySelector('#remarkableInterval') as HTMLSelectElement;

      toggle.checked = status.enabled;
      ocrToggle.checked = status.ocr_enabled;
      source.value = status.source_folder;
      dest.value = status.dest_folder;
      interval.value = String(status.poll_interval_seconds);

      this.renderRemarkableLog(status.recent_syncs);
    } catch {
      // Dropbox not connected — hide section
      section.style.display = 'none';
    }
  }

  private renderRemarkableLog(entries: RemarkableSyncStatus['recent_syncs']): void {
    const logEl = this.panel.querySelector('#remarkableLog') as HTMLElement;
    if (!entries.length) {
      logEl.innerHTML = '<div class="remarkable-log-empty">No sync activity yet</div>';
      return;
    }
    logEl.innerHTML = entries.slice(0, 10).map(e => {
      const time = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const size = e.size_bytes ? `${Math.round(e.size_bytes / 1024)}KB` : '';
      const statusClass = e.status === 'copied' ? 'copied' : e.status === 'error' ? 'error' : 'skipped';
      const ocrBadge = e.ocr_status === 'completed' ? `<span class="remarkable-log-ocr" title="${e.ocr_lines} lines → ${e.ocr_text_path}">OCR</span>` : '';
      return `<div class="remarkable-log-entry">
        <span class="remarkable-log-time">${time}</span>
        <span class="remarkable-log-name" title="${e.source_path}">${e.file_name}</span>
        <span class="remarkable-log-status ${statusClass}">${e.status}</span>
        ${ocrBadge}
        <span class="remarkable-log-size">${size}</span>
      </div>`;
    }).join('');
  }

  private async saveRemarkableConfig(): Promise<void> {
    const toggle = this.panel.querySelector('#remarkableToggle') as HTMLInputElement;
    const ocrToggle = this.panel.querySelector('#remarkableOcrToggle') as HTMLInputElement;
    const source = this.panel.querySelector('#remarkableSource') as HTMLInputElement;
    const dest = this.panel.querySelector('#remarkableDest') as HTMLInputElement;
    const interval = this.panel.querySelector('#remarkableInterval') as HTMLSelectElement;

    await this.dropbox.saveRemarkableConfig({
      enabled: toggle.checked,
      ocr_enabled: ocrToggle.checked,
      source_folder: source.value,
      dest_folder: dest.value,
      poll_interval_seconds: parseInt(interval.value),
    });

    const resultEl = this.panel.querySelector('#remarkableSyncResult') as HTMLElement;
    resultEl.style.display = 'block';
    resultEl.textContent = 'Settings saved';
    resultEl.className = 'remarkable-sync-result success';
    setTimeout(() => { resultEl.style.display = 'none'; }, 2000);
  }

  private async triggerRemarkableSync(): Promise<void> {
    const btn = this.panel.querySelector('#remarkableSyncNow') as HTMLButtonElement;
    const resultEl = this.panel.querySelector('#remarkableSyncResult') as HTMLElement;
    btn.disabled = true;
    btn.textContent = 'Syncing...';
    resultEl.style.display = 'block';
    resultEl.textContent = 'Syncing...';
    resultEl.className = 'remarkable-sync-result';

    try {
      const result = await this.dropbox.triggerRemarkableSync();
      const parts: string[] = [];
      if (result.files_copied) parts.push(`${result.files_copied} copied`);
      if (result.files_skipped) parts.push(`${result.files_skipped} skipped`);
      if (result.errors.length) parts.push(`${result.errors.length} errors`);
      resultEl.textContent = parts.length ? parts.join(', ') : 'No new files';
      resultEl.className = `remarkable-sync-result ${result.errors.length ? 'error' : 'success'}`;

      // Refresh the log
      await this.refreshRemarkableStatus();
    } catch (e) {
      resultEl.textContent = 'Sync failed';
      resultEl.className = 'remarkable-sync-result error';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sync Now';
    }
  }

  private async navigateTo(path: string): Promise<void> {
    this.currentBrowsePath = path;
    await this.refreshFolderContents();
  }

  private async selectFile(path: string): Promise<void> {
    try {
      await this.dropbox.saveConfig({
        filePath: path,
        autoSync: (
          this.panel.querySelector('#autoSyncToggle') as HTMLInputElement
        ).checked,
        syncFrequency: parseInt(
          (this.panel.querySelector('#syncFrequency') as HTMLSelectElement)
            .value,
        ),
      });
      // Reload the page to pick up the new file
      window.location.reload();
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }
}
