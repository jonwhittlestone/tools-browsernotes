import { VimMode } from './VimMode';

export class NotesApp {
    notepad: HTMLTextAreaElement;
    saveStatus: HTMLElement;
    vimModeIndicator: HTMLElement;
    dateTemplateBtn: HTMLButtonElement;
    
    vimEnabled: boolean = false;
    vimMode: string = 'normal';
    saveTimeout: number | null = null;
    vim: VimMode | null = null;
    
    constructor() {
        this.notepad = document.getElementById('notepad') as HTMLTextAreaElement;
        this.saveStatus = document.getElementById('saveStatus') as HTMLElement;
        this.vimModeIndicator = document.getElementById('vimMode') as HTMLElement;
        this.dateTemplateBtn = document.getElementById('dateTemplateBtn') as HTMLButtonElement;
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
        
        this.dateTemplateBtn.addEventListener('click', () => {
            this.insertDateTemplate();
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
        
        // Create template
        const template = `## W${weekNumber} ${year}-${month}-${day} ${weekday}\n\n- todo.\n\n`;
        
        const currentContent = this.notepad.value;
        this.notepad.value = template + currentContent;
        
        // Move cursor after "- todo."
        const cursorPosition = template.indexOf('- todo.') + 7;
        this.notepad.setSelectionRange(cursorPosition, cursorPosition);
        this.notepad.focus();
        
        // Trigger save
        this.saveNotes();
    }
}