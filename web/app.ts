import { VimMode } from '../src/VimMode';
import { WebDropboxClient, DropboxStatus } from './WebDropboxClient';
import { TaskView } from './TaskView';
import { SettingsPanel, WebSettings } from './SettingsPanel';

export class WebNotesApp {
  notepad: HTMLTextAreaElement;
  saveStatus: HTMLElement;
  vimModeIndicator: HTMLElement;
  dateTemplateBtn: HTMLButtonElement;
  familyPlannerBtn: HTMLButtonElement;
  viewToggleBtn: HTMLButtonElement;
  textViewEl: HTMLElement;
  taskViewEl: HTMLElement;
  settingsBtn: HTMLButtonElement;
  taskCount: HTMLElement;
  inboxCount: HTMLElement;
  pocketMoney: HTMLElement;

  vimEnabled: boolean = false;
  saveTimeout: number | null = null;
  metricsInterval: number | null = null;
  vim: VimMode | null = null;
  taskView: TaskView;
  settingsPanel: SettingsPanel;
  currentView: 'text' | 'task' = 'text';

  dropbox: WebDropboxClient;
  dropboxConnected: boolean = false;
  autoSync: boolean = true;
  syncFrequency: number = 30;
  currentFilePath: string | null = null;
  lastSyncedContent: string = '';
  syncInterval: number | null = null;
  isSyncing: boolean = false;
  currentRev: string | undefined;

  constructor() {
    this.notepad = document.getElementById('notepad') as HTMLTextAreaElement;
    this.saveStatus = document.getElementById('saveStatus') as HTMLElement;
    this.vimModeIndicator = document.getElementById('vimMode') as HTMLElement;
    this.dateTemplateBtn = document.getElementById(
      'dateTemplateBtn',
    ) as HTMLButtonElement;
    this.familyPlannerBtn = document.getElementById(
      'familyPlannerBtn',
    ) as HTMLButtonElement;
    this.viewToggleBtn = document.getElementById(
      'viewToggle',
    ) as HTMLButtonElement;
    this.textViewEl = document.getElementById('textView') as HTMLElement;
    this.taskViewEl = document.getElementById('taskView') as HTMLElement;
    this.settingsBtn = document.getElementById(
      'settingsBtn',
    ) as HTMLButtonElement;
    this.taskCount = document.getElementById('taskCount') as HTMLElement;
    this.inboxCount = document.getElementById('inboxCount') as HTMLElement;
    this.pocketMoney = document.getElementById('pocketMoney') as HTMLElement;

    this.dropbox = new WebDropboxClient();
    this.taskView = new TaskView({
      container: this.taskViewEl,
      onContentChange: (markdown: string) => {
        this.notepad.value = markdown;
        this.saveNotes();
        this.updateTaskCount();
      },
    });
    this.settingsPanel = new SettingsPanel({
      dropbox: this.dropbox,
      onSettingsChange: (settings: WebSettings) =>
        this.handleSettingsChange(settings),
    });
  }

  async init(): Promise<void> {
    this.loadLocalSettings();
    await this.initDropbox();
    await this.loadNotes();
    this.setupEventListeners();
    this.startMetricsPolling();

    if (this.vimEnabled) {
      this.initVimMode();
    }

    if (this.dropboxConnected && this.autoSync) {
      this.startAutoSync();
    }

    // Auto-switch to task view on mobile
    if (window.innerWidth <= 768) {
      this.switchView('task');
    }
  }

  loadLocalSettings(): void {
    this.vimEnabled = localStorage.getItem('vimEnabled') === 'true';
    this.autoSync = localStorage.getItem('autoSync') !== 'false';
    const freq = localStorage.getItem('syncFrequency');
    if (freq) this.syncFrequency = parseInt(freq);
  }

  handleSettingsChange(settings: WebSettings): void {
    // Vim mode
    if (settings.vimEnabled && !this.vimEnabled) {
      this.vimEnabled = true;
      this.initVimMode();
    } else if (!settings.vimEnabled && this.vimEnabled) {
      this.vimEnabled = false;
      this.disableVimMode();
    }

    // Sync settings
    this.autoSync = settings.autoSync;
    this.syncFrequency = settings.syncFrequency;

    if (this.dropboxConnected && this.autoSync) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  async initDropbox(): Promise<void> {
    try {
      const status: DropboxStatus = await this.dropbox.getStatus();
      this.dropboxConnected = status.connected;
      this.currentFilePath = status.file_path;
      this.autoSync = status.auto_sync;
      this.syncFrequency = status.sync_frequency;
    } catch {
      console.error('Failed to get Dropbox status');
    }
  }

  async loadNotes(): Promise<void> {
    if (this.dropboxConnected && this.currentFilePath) {
      await this.syncFromDropbox();
    } else {
      const saved = localStorage.getItem('notes');
      if (saved) {
        this.notepad.value = saved;
        this.lastSyncedContent = saved;
      }
    }
    this.updateTaskCount();
  }

  setupEventListeners(): void {
    this.notepad.addEventListener('input', () => {
      this.saveNotes();
      this.updateTaskCount();
    });

    this.dateTemplateBtn.addEventListener('click', () => {
      this.insertDateTemplate();
    });

    this.familyPlannerBtn.addEventListener('click', () => {
      this.emailFamilyPlanner();
    });

    this.viewToggleBtn.addEventListener('click', () => {
      this.switchView(this.currentView === 'text' ? 'task' : 'text');
    });

    this.settingsBtn.addEventListener('click', () => {
      this.settingsPanel.open();
    });

    this.notepad.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (this.dropboxConnected) {
          this.syncFromDropbox();
          this.showSaveStatus('Manual sync triggered');
        }
      }
    });

    window.addEventListener('beforeunload', () => {
      if (this.hasUnsyncedChanges()) {
        this.syncToDropbox();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.dropboxConnected) {
        this.syncFromDropbox();
      }
    });
  }

  saveNotes(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(async () => {
      const content = this.notepad.value;
      localStorage.setItem('notes', content);

      if (this.dropboxConnected && this.autoSync) {
        await this.syncToDropbox();
      } else {
        this.showSaveStatus('Saved locally');
      }
    }, 500);
  }

  async syncToDropbox(): Promise<void> {
    if (!this.currentFilePath || this.isSyncing) return;

    const content = this.notepad.value;
    if (content === this.lastSyncedContent) return;

    this.isSyncing = true;

    try {
      const result = await this.dropbox.writeFile(
        this.currentFilePath,
        content,
        this.currentRev,
      );
      this.currentRev = result.rev;
      this.lastSyncedContent = content;
      this.showSaveStatus('Synced to Dropbox');
    } catch (error: any) {
      if (error.message === 'FILE_CONFLICT') {
        await this.handleConflict();
      } else {
        console.error('Failed to sync to Dropbox:', error);
        this.showSaveStatus('Sync failed', true);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  async syncFromDropbox(): Promise<void> {
    if (!this.currentFilePath || this.isSyncing) return;

    this.isSyncing = true;

    try {
      const result = await this.dropbox.readFile(this.currentFilePath);
      this.currentRev = result.rev;

      if (result.content !== this.lastSyncedContent) {
        const localContent = this.notepad.value;

        if (
          localContent !== this.lastSyncedContent &&
          localContent !== result.content
        ) {
          const useRemote = confirm(
            'Your local notes have changed and differ from Dropbox.\n\n' +
              'Do you want to use the Dropbox version?\n\n' +
              'Click OK to use Dropbox version, Cancel to keep local version.',
          );

          if (useRemote) {
            this.notepad.value = result.content;
            this.lastSyncedContent = result.content;
            localStorage.setItem('notes', result.content);
          } else {
            await this.syncToDropbox();
          }
        } else {
          this.notepad.value = result.content;
          this.lastSyncedContent = result.content;
          localStorage.setItem('notes', result.content);
        }
      }
    } catch (error) {
      console.error('Failed to sync from Dropbox:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  async handleConflict(): Promise<void> {
    const useLocal = confirm(
      'There was a conflict with the Dropbox file.\n\n' +
        'Another device may have updated the file.\n\n' +
        'Do you want to overwrite with your local version?\n\n' +
        'Click OK to overwrite, Cancel to download the remote version.',
    );

    if (useLocal) {
      try {
        const content = this.notepad.value;
        const result = await this.dropbox.writeFile(
          this.currentFilePath!,
          content,
        );
        this.currentRev = result.rev;
        this.lastSyncedContent = content;
        this.showSaveStatus('Conflict resolved - local version saved');
      } catch (error) {
        console.error('Failed to resolve conflict:', error);
        this.showSaveStatus('Failed to resolve conflict', true);
      }
    } else {
      await this.syncFromDropbox();
      this.showSaveStatus('Conflict resolved - remote version loaded');
    }
  }

  startAutoSync(): void {
    this.stopAutoSync();
    this.syncInterval = window.setInterval(() => {
      if (!document.hidden) {
        this.syncFromDropbox();
      }
    }, this.syncFrequency * 1000);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  hasUnsyncedChanges(): boolean {
    return this.notepad.value !== this.lastSyncedContent;
  }

  showSaveStatus(message: string, isError: boolean = false): void {
    this.saveStatus.textContent = message;
    this.saveStatus.classList.add('visible');

    if (isError) {
      this.saveStatus.style.color = '#f44336';
    } else {
      this.saveStatus.style.color = '';
    }

    setTimeout(() => {
      this.saveStatus.classList.remove('visible');
    }, 2000);
  }

  initVimMode(): void {
    this.vim = new VimMode(this.notepad, this.vimModeIndicator);
    this.vim.enable();
  }

  disableVimMode(): void {
    if (this.vim) {
      this.vim.disable();
      this.vim = null;
    }
  }

  switchView(view: 'text' | 'task'): void {
    this.currentView = view;

    if (view === 'task') {
      this.textViewEl.style.display = 'none';
      this.taskViewEl.style.display = 'block';
      this.taskView.render(this.notepad.value);
      this.viewToggleBtn.textContent = 'Text View';
      this.viewToggleBtn.classList.add('active');
    } else {
      this.textViewEl.style.display = '';
      this.taskViewEl.style.display = 'none';
      this.viewToggleBtn.textContent = 'Task View';
      this.viewToggleBtn.classList.remove('active');
    }
  }

  insertDateTemplate(): void {
    const date = new Date();
    const startDate = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor(
      (date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
    );
    const weekNumber = Math.ceil((days + startDate.getDay() + 1) / 7);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });

    const template = `## ${year}-${month}-${day}-W${weekNumber}-${weekday}\n\n- todo.\n\n---\n\n`;

    const currentContent = this.notepad.value;
    this.notepad.value = template + currentContent;

    const cursorPosition = template.indexOf('- todo.') + 7;
    this.notepad.setSelectionRange(cursorPosition, cursorPosition);
    this.notepad.focus();

    this.saveNotes();
  }

  async emailFamilyPlanner(): Promise<void> {
    const originalText = this.familyPlannerBtn.textContent;
    this.familyPlannerBtn.textContent = 'Sending...';
    this.familyPlannerBtn.disabled = true;

    try {
      const response = await fetch(
        'https://howapped.zapto.org/calplan/send',
        { method: 'POST' },
      );

      if (response.ok) {
        this.familyPlannerBtn.textContent = 'Sent!';
        setTimeout(() => {
          this.familyPlannerBtn.textContent = originalText;
          this.familyPlannerBtn.disabled = false;
        }, 2000);
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send family planner email:', error);
      this.familyPlannerBtn.textContent = 'Failed';
      setTimeout(() => {
        this.familyPlannerBtn.textContent = originalText;
        this.familyPlannerBtn.disabled = false;
      }, 2000);
    }
  }

  startMetricsPolling(): void {
    this.updateMetrics();
    this.metricsInterval = window.setInterval(() => {
      this.updateMetrics();
    }, 30000);
  }

  async updateMetrics(): Promise<void> {
    try {
      await Promise.all([this.updateInboxCount(), this.updatePocketMoney()]);
    } catch (error) {
      console.error('Error updating metrics:', error);
    }
  }

  updateTaskCount(): void {
    const content = this.notepad.value;
    const lines = content.split('\n');
    const count = lines.filter((line) => {
      const trimmed = line.trimStart();
      return trimmed.startsWith('-') && !trimmed.match(/^-{3,}$/);
    }).length;
    this.taskCount.textContent = `${count}`;
  }

  async updateInboxCount(): Promise<void> {
    try {
      const response = await fetch(
        'https://howapped.zapto.org/kaizen/inbox/count',
      );
      if (response.ok) {
        const data = await response.json();
        this.inboxCount.textContent = `${data.INBOX}`;
      } else {
        this.inboxCount.textContent = 'Error';
      }
    } catch {
      this.inboxCount.textContent = '--';
    }
  }

  async updatePocketMoney(): Promise<void> {
    try {
      const response = await fetch(
        'https://howapped.zapto.org/kaizen/pocketmoney/joseph',
      );
      if (response.ok) {
        const data = await response.json();
        this.pocketMoney.textContent = `${data.POCKETMONEY}`;
      } else {
        this.pocketMoney.textContent = 'Error';
      }
    } catch {
      this.pocketMoney.textContent = '--';
    }
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new WebNotesApp().init();
  });
} else {
  new WebNotesApp().init();
}
