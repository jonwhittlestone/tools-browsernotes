class NotesApp {
    constructor() {
        this.notepad = document.getElementById('notepad');
        this.saveStatus = document.getElementById('saveStatus');
        this.vimModeIndicator = document.getElementById('vimMode');
        
        this.vimEnabled = false;
        this.vimMode = 'normal';
        this.saveTimeout = null;
        
        this.init();
    }
    
    async init() {
        await this.loadSettings();
        await this.loadNotes();
        this.setupEventListeners();
        
        if (this.vimEnabled) {
            this.initVimMode();
        }
    }
    
    async loadSettings() {
        const result = await chrome.storage.sync.get(['vimEnabled']);
        this.vimEnabled = result.vimEnabled || false;
    }
    
    async loadNotes() {
        const result = await chrome.storage.local.get(['notes']);
        if (result.notes) {
            this.notepad.value = result.notes;
        }
    }
    
    setupEventListeners() {
        this.notepad.addEventListener('input', () => {
            this.saveNotes();
        });
        
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'sync' && changes.vimEnabled) {
                this.vimEnabled = changes.vimEnabled.newValue;
                if (this.vimEnabled) {
                    this.initVimMode();
                } else {
                    this.disableVimMode();
                }
            }
        });
    }
    
    saveNotes() {
        clearTimeout(this.saveTimeout);
        
        this.saveTimeout = setTimeout(async () => {
            await chrome.storage.local.set({ notes: this.notepad.value });
            this.showSaveStatus();
        }, 500);
    }
    
    showSaveStatus() {
        this.saveStatus.textContent = 'Saved';
        this.saveStatus.classList.add('visible');
        
        setTimeout(() => {
            this.saveStatus.classList.remove('visible');
        }, 2000);
    }
    
    initVimMode() {
        if (!window.VimMode) {
            setTimeout(() => this.initVimMode(), 100);
            return;
        }
        
        this.vim = new VimMode(this.notepad, this.vimModeIndicator);
        this.vim.enable();
    }
    
    disableVimMode() {
        if (this.vim) {
            this.vim.disable();
            this.vim = null;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NotesApp();
});