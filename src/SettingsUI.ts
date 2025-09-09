import { DropboxService, DropboxEntry } from './DropboxService';

declare global {
    interface Window {
        DROPBOX_CONFIG?: {
            APP_KEY: string;
        };
    }
}

export class SettingsUI {
    private dropboxService: DropboxService;
    private dropboxClientId: string;
    private currentPath: string = '';
    
    constructor() {
        console.log('SettingsUI constructor called');
        
        this.dropboxClientId = window.DROPBOX_CONFIG?.APP_KEY || 'YOUR_DROPBOX_APP_KEY';
        console.log('Dropbox config:', window.DROPBOX_CONFIG);
        console.log('Client ID:', this.dropboxClientId);
        
        if (this.dropboxClientId === 'YOUR_DROPBOX_APP_KEY') {
            console.warn('Dropbox app key not configured. Please set up config.js');
        }
        
        const extensionId = chrome.runtime.id;
        const redirectUri = `https://${extensionId}.chromiumapp.org/`;
        
        this.dropboxService = new DropboxService({
            clientId: this.dropboxClientId,
            redirectUri: redirectUri
        });
        
        this.init();
    }
    
    async init(): Promise<void> {
        await this.loadSettings();
        await this.setupDropboxUI();
        this.setupEventListeners();
    }
    
    async loadSettings(): Promise<void> {
        const result = await chrome.storage.sync.get(['vimEnabled', 'workContextEnabled', 'autoSync', 'syncFrequency']);
        
        const vimModeCheckbox = document.getElementById('vimMode') as HTMLInputElement;
        const workContextCheckbox = document.getElementById('workContext') as HTMLInputElement;
        const autoSyncCheckbox = document.getElementById('autoSync') as HTMLInputElement;
        const syncFrequencySelect = document.getElementById('syncFrequency') as HTMLSelectElement;
        const vimHelp = document.getElementById('vimHelp');
        
        if (vimModeCheckbox) {
            vimModeCheckbox.checked = result.vimEnabled || false;
            if (vimHelp) {
                vimHelp.style.display = vimModeCheckbox.checked ? 'block' : 'none';
            }
        }
        
        if (workContextCheckbox) {
            workContextCheckbox.checked = result.workContextEnabled !== false; // Default to true
        }
        
        if (autoSyncCheckbox) {
            autoSyncCheckbox.checked = result.autoSync !== false;
        }
        
        if (syncFrequencySelect) {
            syncFrequencySelect.value = String(result.syncFrequency || 30);
        }
    }
    
    async setupDropboxUI(): Promise<void> {
        await this.dropboxService.loadTokens();
        
        if (this.dropboxService.isAuthenticated()) {
            this.showConnectedState();
            await this.loadDropboxContent();
            await this.loadCurrentFile();
        } else {
            this.showDisconnectedState();
        }
    }
    
    setupEventListeners(): void {
        const vimModeCheckbox = document.getElementById('vimMode') as HTMLInputElement;
        const workContextCheckbox = document.getElementById('workContext') as HTMLInputElement;
        const autoSyncCheckbox = document.getElementById('autoSync') as HTMLInputElement;
        const connectButton = document.getElementById('connectDropbox');
        const disconnectButton = document.getElementById('disconnectDropbox');
        const refreshButton = document.getElementById('refreshFiles');
        const createFileButton = document.getElementById('createFile');
        const filesSelect = document.getElementById('dropboxFiles') as HTMLSelectElement;
        const syncNowButton = document.getElementById('syncNow');
        const folderList = document.getElementById('folderList');
        const syncFrequencySelect = document.getElementById('syncFrequency') as HTMLSelectElement;
        
        if (vimModeCheckbox) {
            vimModeCheckbox.addEventListener('change', async (e) => {
                const isChecked = (e.target as HTMLInputElement).checked;
                await chrome.storage.sync.set({ vimEnabled: isChecked });
                
                const vimHelp = document.getElementById('vimHelp');
                if (vimHelp) {
                    vimHelp.style.display = isChecked ? 'block' : 'none';
                }
            });
        }
        
        if (workContextCheckbox) {
            workContextCheckbox.addEventListener('change', async (e) => {
                const isChecked = (e.target as HTMLInputElement).checked;
                await chrome.storage.sync.set({ workContextEnabled: isChecked });
            });
        }
        
        if (autoSyncCheckbox) {
            autoSyncCheckbox.addEventListener('change', async (e) => {
                const isChecked = (e.target as HTMLInputElement).checked;
                await chrome.storage.sync.set({ autoSync: isChecked });
            });
        }
        
        if (syncFrequencySelect) {
            syncFrequencySelect.addEventListener('change', async (e) => {
                const frequency = parseInt((e.target as HTMLSelectElement).value);
                await chrome.storage.sync.set({ syncFrequency: frequency });
                
                // Notify the main app about the change
                chrome.runtime.sendMessage({ 
                    type: 'SYNC_FREQUENCY_CHANGED', 
                    frequency: frequency 
                });
            });
        }
        
        if (connectButton) {
            connectButton.addEventListener('click', () => this.connectDropbox());
        }
        
        if (disconnectButton) {
            disconnectButton.addEventListener('click', () => this.disconnectDropbox());
        }
        
        if (refreshButton) {
            refreshButton.addEventListener('click', () => this.loadDropboxContent());
        }
        
        if (createFileButton) {
            createFileButton.addEventListener('click', () => this.createNewFile());
        }
        
        if (filesSelect) {
            filesSelect.addEventListener('change', (e) => {
                const path = (e.target as HTMLSelectElement).value;
                if (path) {
                    this.selectFile(path);
                }
            });
        }
        
        if (syncNowButton) {
            syncNowButton.addEventListener('click', () => this.syncNow());
        }
        
        // Breadcrumb navigation
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('breadcrumb-item') && target.classList.contains('clickable')) {
                const path = target.getAttribute('data-path') || '';
                this.navigateToPath(path);
            }
        });
    }
    
    async connectDropbox(): Promise<void> {
        console.log('Connect to Dropbox clicked');
        const statusDiv = document.getElementById('dropboxStatus');
        
        try {
            if (statusDiv) {
                statusDiv.textContent = 'Connecting to Dropbox...';
                statusDiv.style.color = '#888';
            }
            
            console.log('Starting authentication with client ID:', this.dropboxClientId);
            console.log('Extension ID:', chrome.runtime.id);
            console.log('Redirect URI:', `https://${chrome.runtime.id}.chromiumapp.org/`);
            
            const success = await this.dropboxService.authenticate();
            
            if (success) {
                console.log('Authentication successful');
                this.showConnectedState();
                await this.loadDropboxContent();
                if (statusDiv) {
                    statusDiv.textContent = 'Successfully connected!';
                    statusDiv.style.color = '#4CAF50';
                }
            } else {
                console.error('Authentication failed - returned false');
                if (statusDiv) {
                    statusDiv.textContent = 'Connection failed. Please try again.';
                    statusDiv.style.color = '#f44336';
                }
            }
        } catch (error) {
            console.error('Connect to Dropbox error:', error);
            if (statusDiv) {
                const errorMessage = error instanceof Error ? error.message : 'Connection failed';
                statusDiv.textContent = `Error: ${errorMessage}`;
                statusDiv.style.color = '#f44336';
            }
        }
    }
    
    async disconnectDropbox(): Promise<void> {
        await this.dropboxService.signOut();
        await chrome.storage.local.remove(['dropboxFilePath', 'lastSyncTime']);
        this.showDisconnectedState();
    }
    
    showConnectedState(): void {
        const authDiv = document.getElementById('dropboxAuth');
        const connectedDiv = document.getElementById('dropboxConnected');
        const fileSection = document.getElementById('dropboxFileSection');
        const syncSettings = document.getElementById('syncSettings');
        const syncFrequencySettings = document.getElementById('syncFrequencySettings');
        const syncStatus = document.getElementById('syncStatus');
        
        if (authDiv) authDiv.style.display = 'none';
        if (connectedDiv) connectedDiv.style.display = 'flex';
        if (fileSection) fileSection.style.display = 'block';
        if (syncSettings) syncSettings.style.display = 'block';
        if (syncFrequencySettings) syncFrequencySettings.style.display = 'block';
        if (syncStatus) syncStatus.style.display = 'block';
    }
    
    showDisconnectedState(): void {
        const authDiv = document.getElementById('dropboxAuth');
        const connectedDiv = document.getElementById('dropboxConnected');
        const fileSection = document.getElementById('dropboxFileSection');
        const syncSettings = document.getElementById('syncSettings');
        const syncFrequencySettings = document.getElementById('syncFrequencySettings');
        const syncStatus = document.getElementById('syncStatus');
        
        if (authDiv) authDiv.style.display = 'block';
        if (connectedDiv) connectedDiv.style.display = 'none';
        if (fileSection) fileSection.style.display = 'none';
        if (syncSettings) syncSettings.style.display = 'none';
        if (syncFrequencySettings) syncFrequencySettings.style.display = 'none';
        if (syncStatus) syncStatus.style.display = 'none';
    }
    
    async loadDropboxContent(): Promise<void> {
        await this.loadFolderContent(this.currentPath);
        this.updateBreadcrumb();
        this.updateNewFilePath();
    }
    
    async loadFolderContent(path: string): Promise<void> {
        const folderList = document.getElementById('folderList');
        const filesSelect = document.getElementById('dropboxFiles') as HTMLSelectElement;
        
        if (!folderList || !filesSelect) return;
        
        folderList.innerHTML = '<div style="padding: 10px; text-align: center;">Loading...</div>';
        filesSelect.innerHTML = '<option value="">Loading files...</option>';
        
        try {
            console.log('Loading Dropbox content for path:', path);
            const entries = await this.dropboxService.listEntries(path);
            console.log('Entries loaded:', entries);
            
            // Clear and populate folder list
            folderList.innerHTML = '';
            
            // Add folders
            const folders = entries.filter(entry => entry.type === 'folder');
            folders.forEach(folder => {
                const folderDiv = document.createElement('div');
                folderDiv.className = 'folder-item folder';
                folderDiv.setAttribute('data-path', folder.path);
                folderDiv.innerHTML = `
                    <span class="folder-icon">📁</span>
                    <span>${folder.name}</span>
                `;
                folderDiv.addEventListener('click', () => this.navigateToPath(folder.path));
                folderList.appendChild(folderDiv);
            });
            
            // Populate files select
            const files = entries.filter(entry => entry.type === 'file' && entry.name.endsWith('.md'));
            filesSelect.innerHTML = '<option value="">Select a file...</option>';
            
            if (files.length === 0) {
                filesSelect.innerHTML = '<option value="">No .md files found - create one below</option>';
            } else {
                files.forEach(file => {
                    const option = document.createElement('option');
                    option.value = file.path;
                    option.textContent = file.name;
                    filesSelect.appendChild(option);
                });
            }
            
            const currentPath = await this.getCurrentFilePath();
            if (currentPath) {
                filesSelect.value = currentPath;
            }
            
            // Show message if no folders and no files
            if (folders.length === 0 && files.length === 0) {
                folderList.innerHTML = '<div style="padding: 10px; text-align: center; color: #888;">This folder is empty</div>';
            }
            
        } catch (error) {
            console.error('Failed to load folder content - full error:', error);
            folderList.innerHTML = '<div style="padding: 10px; text-align: center; color: #f44336;">Failed to load content</div>';
            filesSelect.innerHTML = '<option value="">Failed to load files - check console</option>';
        }
    }
    
    navigateToPath(path: string): void {
        this.currentPath = path;
        this.loadDropboxContent();
    }
    
    updateBreadcrumb(): void {
        const breadcrumbPath = document.getElementById('breadcrumbPath');
        if (!breadcrumbPath) return;
        
        if (!this.currentPath) {
            breadcrumbPath.innerHTML = '';
            return;
        }
        
        const parts = this.currentPath.split('/').filter(part => part);
        let html = '';
        let currentPath = '';
        
        parts.forEach((part, index) => {
            currentPath += '/' + part;
            html += `<span class="breadcrumb-separator">/</span>`;
            html += `<span class="breadcrumb-item clickable" data-path="${currentPath}">📁 ${part}</span>`;
        });
        
        breadcrumbPath.innerHTML = html;
    }
    
    updateNewFilePath(): void {
        const newFilePathInput = document.getElementById('newFilePath') as HTMLInputElement;
        if (!newFilePathInput) return;
        
        const displayPath = this.currentPath || '/';
        newFilePathInput.value = displayPath;
    }
    
    async loadCurrentFile(): Promise<void> {
        const currentPath = await this.getCurrentFilePath();
        if (currentPath) {
            const currentFileDiv = document.getElementById('currentFile');
            const currentFilePathSpan = document.getElementById('currentFilePath');
            
            if (currentFileDiv) currentFileDiv.style.display = 'block';
            if (currentFilePathSpan) currentFilePathSpan.textContent = currentPath;
        }
        
        const lastSyncTime = await this.getLastSyncTime();
        if (lastSyncTime) {
            const lastSyncSpan = document.getElementById('lastSyncTime');
            if (lastSyncSpan) {
                lastSyncSpan.textContent = new Date(lastSyncTime).toLocaleString();
            }
        }
    }
    
    async createNewFile(): Promise<void> {
        const fileNameInput = document.getElementById('newFileName') as HTMLInputElement;
        if (!fileNameInput || !fileNameInput.value) {
            alert('Please enter a file name');
            return;
        }
        
        let fileName = fileNameInput.value.trim();
        if (!fileName.endsWith('.md')) {
            fileName += '.md';
        }
        
        const path = this.currentPath ? `${this.currentPath}/${fileName}` : `/${fileName}`;
        
        try {
            const result = await chrome.storage.local.get(['notes']);
            const content = result.notes || 'Your notes will be synced here.';
            
            const file = await this.dropboxService.createFile(path, content);
            
            await this.selectFile(file.path);
            await this.loadDropboxContent();
            
            fileNameInput.value = '';
            alert(`File "${file.name}" created successfully!`);
        } catch (error) {
            console.error('Failed to create file:', error);
            alert('Failed to create file. Please try again.');
        }
    }
    
    async selectFile(path: string): Promise<void> {
        await chrome.storage.local.set({ dropboxFilePath: path });
        
        const currentFileDiv = document.getElementById('currentFile');
        const currentFilePathSpan = document.getElementById('currentFilePath');
        
        if (currentFileDiv) currentFileDiv.style.display = 'block';
        if (currentFilePathSpan) currentFilePathSpan.textContent = path;
        
        await this.syncNow();
    }
    
    async syncNow(): Promise<void> {
        const syncButton = document.getElementById('syncNow') as HTMLButtonElement;
        if (syncButton) {
            syncButton.disabled = true;
            syncButton.textContent = 'Syncing...';
        }
        
        try {
            const path = await this.getCurrentFilePath();
            if (!path) {
                alert('Please select a file first');
                return;
            }
            
            const content = await this.dropboxService.readFile(path);
            
            await chrome.storage.local.set({
                notes: content,
                lastSyncTime: Date.now()
            });
            
            const lastSyncSpan = document.getElementById('lastSyncTime');
            if (lastSyncSpan) {
                lastSyncSpan.textContent = new Date().toLocaleString();
            }
            
            chrome.runtime.sendMessage({ type: 'DROPBOX_SYNC_COMPLETE' });
            
        } catch (error) {
            console.error('Sync failed:', error);
            alert('Sync failed. Please try again.');
        } finally {
            if (syncButton) {
                syncButton.disabled = false;
                syncButton.textContent = 'Sync Now';
            }
        }
    }
    
    async getCurrentFilePath(): Promise<string | null> {
        const result = await chrome.storage.local.get(['dropboxFilePath']);
        return result.dropboxFilePath || null;
    }
    
    async getLastSyncTime(): Promise<number | null> {
        const result = await chrome.storage.local.get(['lastSyncTime']);
        return result.lastSyncTime || null;
    }
}

console.log('SettingsUI.ts loaded');

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded fired, initializing SettingsUI');
    new SettingsUI();
});