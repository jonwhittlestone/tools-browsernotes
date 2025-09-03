import { VimMode } from './VimMode';
import { DropboxService, DropboxEntry } from './DropboxService';

declare global {
    interface Window {
        DROPBOX_CONFIG?: {
            APP_KEY: string;
        };
    }
}

export class NotesAppWithDropbox {
    notepad: HTMLTextAreaElement;
    saveStatus: HTMLElement;
    vimModeIndicator: HTMLElement;
    dateTemplateBtn: HTMLButtonElement;
    inboxCount: HTMLElement;
    pocketMoney: HTMLElement;
    
    vimEnabled: boolean = false;
    vimMode: string = 'normal';
    saveTimeout: number | null = null;
    metricsInterval: number | null = null;
    vim: VimMode | null = null;
    
    dropboxService: DropboxService | null = null;
    dropboxSyncEnabled: boolean = false;
    autoSync: boolean = true;
    syncFrequency: number = 30; // seconds
    currentFilePath: string | null = null;
    lastSyncedContent: string = '';
    syncInterval: number | null = null;
    isSyncing: boolean = false;
    
    constructor() {
        this.notepad = document.getElementById('notepad') as HTMLTextAreaElement;
        this.saveStatus = document.getElementById('saveStatus') as HTMLElement;
        this.vimModeIndicator = document.getElementById('vimMode') as HTMLElement;
        this.dateTemplateBtn = document.getElementById('dateTemplateBtn') as HTMLButtonElement;
        this.inboxCount = document.getElementById('inboxCount') as HTMLElement;
        this.pocketMoney = document.getElementById('pocketMoney') as HTMLElement;
    }
    
    async init(): Promise<void> {
        await this.loadSettings();
        await this.initDropbox();
        await this.loadNotes();
        this.setupEventListeners();
        this.startMetricsPolling();
        
        if (this.vimEnabled) {
            this.initVimMode();
        }
        
        if (this.dropboxSyncEnabled && this.autoSync) {
            this.startAutoSync();
        }
        
        // Listen for sync frequency changes from settings
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'SYNC_FREQUENCY_CHANGED') {
                this.syncFrequency = message.frequency;
                if (this.dropboxSyncEnabled && this.autoSync) {
                    this.startAutoSync(); // Restart with new frequency
                }
            }
        });
    }
    
    async loadSettings(): Promise<void> {
        const result = await chrome.storage.sync.get(['vimEnabled', 'autoSync', 'syncFrequency']);
        this.vimEnabled = result.vimEnabled || false;
        this.autoSync = result.autoSync !== false;
        this.syncFrequency = result.syncFrequency || 30;
    }
    
    async initDropbox(): Promise<void> {
        const result = await chrome.storage.local.get([
            'dropboxAccessToken',
            'dropboxRefreshToken',
            'dropboxFilePath'
        ]);
        
        if (result.dropboxAccessToken) {
            const extensionId = chrome.runtime.id;
            const redirectUri = `https://${extensionId}.chromiumapp.org/`;
            
            const clientId = window.DROPBOX_CONFIG?.APP_KEY || 'YOUR_DROPBOX_APP_KEY';
            
            if (clientId === 'YOUR_DROPBOX_APP_KEY') {
                console.warn('Dropbox app key not configured. Please set up config.js');
            }
            
            this.dropboxService = new DropboxService({
                clientId: clientId,
                redirectUri: redirectUri,
                accessToken: result.dropboxAccessToken,
                refreshToken: result.dropboxRefreshToken
            });
            
            this.currentFilePath = result.dropboxFilePath || null;
            this.dropboxSyncEnabled = !!this.currentFilePath;
        }
    }
    
    async loadNotes(): Promise<void> {
        if (this.dropboxSyncEnabled && this.dropboxService && this.currentFilePath) {
            await this.syncFromDropbox();
        } else {
            const result = await chrome.storage.local.get(['notes']);
            if (result.notes) {
                this.notepad.value = result.notes;
                this.lastSyncedContent = result.notes;
            }
        }
    }
    
    setupEventListeners(): void {
        this.notepad.addEventListener('input', () => {
            this.saveNotes();
        });
        
        this.dateTemplateBtn.addEventListener('click', () => {
            this.insertDateTemplate();
        });
        
        // Add manual sync shortcut (Ctrl+S or Cmd+S)
        this.notepad.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (this.dropboxSyncEnabled) {
                    this.syncFromDropbox();
                    this.showSaveStatus('Manual sync triggered');
                }
                return;
            }
        });
        
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync') {
                if (changes.vimEnabled) {
                    this.vimEnabled = changes.vimEnabled.newValue;
                    if (this.vimEnabled) {
                        this.initVimMode();
                    } else {
                        this.disableVimMode();
                    }
                }
                if (changes.autoSync) {
                    this.autoSync = changes.autoSync.newValue;
                    if (this.autoSync && this.dropboxSyncEnabled) {
                        this.startAutoSync();
                    } else {
                        this.stopAutoSync();
                    }
                }
            }
            
            if (namespace === 'local') {
                if (changes.dropboxFilePath) {
                    this.currentFilePath = changes.dropboxFilePath.newValue;
                    this.dropboxSyncEnabled = !!this.currentFilePath;
                    if (this.dropboxSyncEnabled && this.autoSync) {
                        this.startAutoSync();
                    }
                }
            }
        });
        
        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'DROPBOX_SYNC_COMPLETE') {
                this.syncFromDropbox();
            }
        });
        
        window.addEventListener('beforeunload', () => {
            if (this.hasUnsyncedChanges()) {
                this.syncToDropbox();
            }
        });
        
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.dropboxSyncEnabled) {
                this.syncFromDropbox();
            }
        });
    }
    
    saveNotes(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(async () => {
            const content = this.notepad.value;
            await chrome.storage.local.set({ notes: content });
            
            if (this.dropboxSyncEnabled && this.autoSync) {
                await this.syncToDropbox();
            } else {
                this.showSaveStatus('Saved locally');
            }
        }, 500);
    }
    
    async syncToDropbox(): Promise<void> {
        if (!this.dropboxService || !this.currentFilePath || this.isSyncing) {
            return;
        }
        
        const content = this.notepad.value;
        if (content === this.lastSyncedContent) {
            return;
        }
        
        this.isSyncing = true;
        
        try {
            const metadata = await this.dropboxService.getFileMetadata(this.currentFilePath);
            
            if (metadata) {
                await this.dropboxService.updateFile(this.currentFilePath, content, metadata.rev);
            } else {
                await this.dropboxService.createFile(this.currentFilePath, content);
            }
            
            this.lastSyncedContent = content;
            await chrome.storage.local.set({ lastSyncTime: Date.now() });
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
        if (!this.dropboxService || !this.currentFilePath || this.isSyncing) {
            return;
        }
        
        this.isSyncing = true;
        
        try {
            const content = await this.dropboxService.readFile(this.currentFilePath);
            
            if (content !== this.lastSyncedContent) {
                const localContent = this.notepad.value;
                
                if (localContent !== this.lastSyncedContent && localContent !== content) {
                    const useRemote = confirm(
                        'Your local notes have changed and differ from Dropbox.\n\n' +
                        'Do you want to use the Dropbox version?\n\n' +
                        'Click OK to use Dropbox version, Cancel to keep local version.'
                    );
                    
                    if (useRemote) {
                        this.notepad.value = content;
                        this.lastSyncedContent = content;
                        await chrome.storage.local.set({ notes: content });
                    } else {
                        await this.syncToDropbox();
                    }
                } else {
                    this.notepad.value = content;
                    this.lastSyncedContent = content;
                    await chrome.storage.local.set({ notes: content });
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
            'Click OK to overwrite, Cancel to download the remote version.'
        );
        
        if (useLocal) {
            try {
                const content = this.notepad.value;
                await this.dropboxService!.updateFile(this.currentFilePath!, content);
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
    
    insertDateTemplate(): void {
        const date = new Date();
        
        // Get week number
        const startDate = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((days + startDate.getDay() + 1) / 7);
        
        // Format date components
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
        
        // Create template with horizontal line
        const template = `## ${year}-${month}-${day}-W${weekNumber}-${weekday}\n\n- todo.\n\n---\n\n`;
        
        const currentContent = this.notepad.value;
        this.notepad.value = template + currentContent;
        
        // Move cursor after "- todo."
        const cursorPosition = template.indexOf('- todo.') + 7;
        this.notepad.setSelectionRange(cursorPosition, cursorPosition);
        this.notepad.focus();
        
        // Trigger save
        this.saveNotes();
    }
    
    startMetricsPolling(): void {
        console.log('Starting metrics polling...');
        this.updateMetrics();
        this.metricsInterval = window.setInterval(() => {
            this.updateMetrics();
        }, 60000); // Poll every minute
    }
    
    async updateMetrics(): Promise<void> {
        console.log('Updating metrics...');
        try {
            await Promise.all([
                this.updateInboxCount(),
                this.updatePocketMoney()
            ]);
        } catch (error) {
            console.error('Error updating metrics:', error);
        }
    }
    
    async updateInboxCount(): Promise<void> {
        try {
            console.log('Fetching inbox count...');
            const response = await fetch('https://howapped.zapto.org/kaizen/inbox/count');
            if (response.ok) {
                const data = await response.json();
                console.log('Inbox count response:', data);
                this.inboxCount.textContent = `Inbox: ${data.INBOX}`;
            } else {
                console.error('Inbox count request failed:', response.status, response.statusText);
                this.inboxCount.textContent = 'Inbox: Error';
            }
        } catch (error) {
            this.inboxCount.textContent = 'Inbox: --';
            console.error('Error fetching inbox count:', error);
        }
    }
    
    async updatePocketMoney(): Promise<void> {
        try {
            console.log('Fetching pocket money...');
            const response = await fetch('https://howapped.zapto.org/kaizen/pocketmoney/joseph');
            if (response.ok) {
                const data = await response.json();
                console.log('Pocket money response:', data);
                this.pocketMoney.textContent = `Joseph's Pocket Money: ${data.POCKETMONEY}`;
            } else {
                console.error('Pocket money request failed:', response.status, response.statusText);
                this.pocketMoney.textContent = 'Joseph\'s Pocket Money: Error';
            }
        } catch (error) {
            this.pocketMoney.textContent = 'Joseph\'s Pocket Money: --';
            console.error('Error fetching pocket money:', error);
        }
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new NotesAppWithDropbox().init();
    });
} else {
    new NotesAppWithDropbox().init();
}