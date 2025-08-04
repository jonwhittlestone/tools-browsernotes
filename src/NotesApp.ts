import { VimMode } from './VimMode';

export class NotesApp {
    notepad: HTMLTextAreaElement;
    saveStatus: HTMLElement;
    vimModeIndicator: HTMLElement;
    
    vimEnabled: boolean = false;
    vimMode: string = 'normal';
    saveTimeout: number | null = null;
    vim: VimMode | null = null;
    
    constructor() {
        this.notepad = document.getElementById('notepad') as HTMLTextAreaElement;
        this.saveStatus = document.getElementById('saveStatus') as HTMLElement;
        this.vimModeIndicator = document.getElementById('vimMode') as HTMLElement;
    }
    
    async init(): Promise<void> {
        await this.loadSettings();
        await this.loadNotes();
        this.setupEventListeners();
        
        if (this.vimEnabled) {
            this.initVimMode();
        }
    }
    
    async loadSettings(): Promise<void> {
        const result = await chrome.storage.sync.get(['vimEnabled']);
        this.vimEnabled = result.vimEnabled || false;
    }
    
    async loadNotes(): Promise<void> {
        const result = await chrome.storage.local.get(['notes']);
        if (result.notes) {
            this.notepad.value = result.notes;
        }
    }
    
    setupEventListeners(): void {
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
    
    saveNotes(): void {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(async () => {
            await chrome.storage.local.set({ notes: this.notepad.value });
            this.showSaveStatus();
        }, 500);
    }
    
    showSaveStatus(): void {
        this.saveStatus.textContent = 'Saved';
        this.saveStatus.classList.add('visible');
        
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
}