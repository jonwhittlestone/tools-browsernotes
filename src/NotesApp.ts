import { VimMode } from './VimMode';

export class NotesApp {
    notepad: HTMLTextAreaElement;
    saveStatus: HTMLElement;
    vimModeIndicator: HTMLElement;
    dateTemplateBtn: HTMLButtonElement;
    taskCount: HTMLElement;
    inboxCount: HTMLElement;
    workInboxCount: HTMLElement;
    workJiraDoneCount: HTMLElement;
    workInboxMetric: HTMLElement;
    workJiraMetric: HTMLElement;
    pocketMoney: HTMLElement;
    
    vimEnabled: boolean = false;
    workContextEnabled: boolean = true;
    vimMode: string = 'normal';
    saveTimeout: number | null = null;
    metricsInterval: number | null = null;
    vim: VimMode | null = null;
    
    constructor() {
        this.notepad = document.getElementById('notepad') as HTMLTextAreaElement;
        this.saveStatus = document.getElementById('saveStatus') as HTMLElement;
        this.vimModeIndicator = document.getElementById('vimMode') as HTMLElement;
        this.dateTemplateBtn = document.getElementById('dateTemplateBtn') as HTMLButtonElement;
        this.taskCount = document.getElementById('taskCount') as HTMLElement;
        this.inboxCount = document.getElementById('inboxCount') as HTMLElement;
        this.workInboxCount = document.getElementById('workInboxCount') as HTMLElement;
        this.workJiraDoneCount = document.getElementById('workJiraDoneCount') as HTMLElement;
        this.workInboxMetric = this.workInboxCount.parentElement as HTMLElement;
        this.workJiraMetric = this.workJiraDoneCount.parentElement as HTMLElement;
        this.pocketMoney = document.getElementById('pocketMoney') as HTMLElement;
    }
    
    async init(): Promise<void> {
        await this.loadSettings();
        await this.loadNotes();
        this.setupEventListeners();
        this.startMetricsPolling();
        
        if (this.vimEnabled) {
            this.initVimMode();
        }
    }
    
    async loadSettings(): Promise<void> {
        const result = await chrome.storage.sync.get(['vimEnabled', 'workContextEnabled']);
        this.vimEnabled = result.vimEnabled || false;
        this.workContextEnabled = result.workContextEnabled !== false; // Default to true
        console.log('Settings loaded - workContextEnabled:', this.workContextEnabled);
    }
    
    async loadNotes(): Promise<void> {
        const result = await chrome.storage.local.get(['notes']);
        if (result.notes) {
            this.notepad.value = result.notes;
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
                if (changes.workContextEnabled) {
                    this.workContextEnabled = changes.workContextEnabled.newValue;
                    this.updateWorkMetricsVisibility();
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
    
    startMetricsPolling(): void {
        console.log('Starting metrics polling...');
        this.updateWorkMetricsVisibility();
        
        this.updateMetrics();
        this.metricsInterval = window.setInterval(() => {
            this.updateMetrics();
        }, 300000); // Poll every 5 minutes
    }
    
    updateWorkMetricsVisibility(): void {
        console.log('updateWorkMetricsVisibility called, workContextEnabled:', this.workContextEnabled);
        if (this.workContextEnabled) {
            // Make work metrics visible with loading state
            console.log('Showing work metrics');
            this.workInboxMetric.style.display = 'inline';
            this.workJiraMetric.style.display = 'inline';
            this.workInboxCount.textContent = 'Loading...';
            this.workJiraDoneCount.textContent = 'Loading...';
        } else {
            // Hide work metrics when work context is disabled
            console.log('Hiding work metrics');
            this.workInboxMetric.style.display = 'none';
            this.workJiraMetric.style.display = 'none';
        }
    }
    
    async updateMetrics(): Promise<void> {
        try {
            const promises = [
                this.updateInboxCount(),
                this.updatePocketMoney()
            ];
            
            // Only add work-related metrics if work context is enabled
            if (this.workContextEnabled) {
                promises.push(
                    this.updateWorkInboxCount(),
                    this.updateWorkJiraDoneCount()
                );
            }
            
            await Promise.all(promises);
        } catch (error) {
            console.error('Error updating metrics:', error);
        }
    }
    
    updateTaskCount(): void {
        const content = this.notepad.value;
        const lines = content.split('\n');
        const taskCount = lines.filter(line => {
            const trimmed = line.trimStart();
            return trimmed.startsWith('-') && !trimmed.match(/^-{3,}$/);
        }).length;
        this.taskCount.textContent = `${taskCount}`;
    }

    async updateInboxCount(): Promise<void> {
        try {
            console.log('Fetching personal inbox count...');
            const response = await fetch('https://howapped.zapto.org/kaizen/inbox/count');
            if (response.ok) {
                const data = await response.json();
                console.log('Personal inbox count response:', data);
                this.inboxCount.textContent = `${data.INBOX}`;
            } else {
                console.error('Personal inbox count request failed:', response.status, response.statusText);
                this.inboxCount.textContent = 'Error';
            }
        } catch (error) {
            this.inboxCount.textContent = '--';
            console.error('Error fetching personal inbox count:', error);
        }
    }

    async updateWorkInboxCount(): Promise<void> {
        console.log('updateWorkInboxCount called, workContextEnabled:', this.workContextEnabled);
        if (!this.workContextEnabled) {
            console.log('Work context disabled, skipping Gmail polling');
            return;
        }
        
        try {
            console.log('Fetching work Gmail inbox count using offscreen document...');
            
            // Send message to background script to get Gmail count via offscreen document
            const response = await chrome.runtime.sendMessage({
                type: 'GET_GMAIL_COUNT_FROM_BACKGROUND'
            });

            if (response && response.type === 'GMAIL_COUNT_RESULT') {
                if (response.error) {
                    this.workInboxCount.style.display = 'none';
                    console.error('Work Gmail count error:', response.error);
                } else if (response.count === -1) {
                    this.workInboxCount.style.display = 'none';
                } else if (response.count === 0 && response.accountNotFound) {
                    // Hide the metric if the correct Gmail account isn't found
                    this.workInboxCount.style.display = 'none';
                    console.log('Work Gmail account not found, hiding metric');
                } else {
                    this.workInboxCount.style.display = 'inline';
                    this.workInboxCount.textContent = `${response.count}`;
                    console.log('Work Gmail inbox count:', response.count);
                }
            } else {
                this.workInboxCount.style.display = 'none';
                console.error('Invalid response from background script');
            }
            
        } catch (error) {
            this.workInboxCount.textContent = '--';
            console.error('Error fetching work Gmail inbox count:', error);
        }
    }

    async updateWorkJiraDoneCount(): Promise<void> {
        console.log('updateWorkJiraDoneCount called, workContextEnabled:', this.workContextEnabled);
        if (!this.workContextEnabled) {
            console.log('Work context disabled, skipping Jira polling');
            return;
        }
        
        try {
            console.log('Fetching work Jira Done count using background tab...');
            
            // Send message to background script to get Jira Done count
            const response = await chrome.runtime.sendMessage({
                type: 'GET_JIRA_DONE_COUNT_FROM_BACKGROUND'
            });

            if (response && response.type === 'JIRA_DONE_COUNT_RESULT') {
                if (response.error || !response.count) {
                    this.workJiraDoneCount.style.display = 'none';
                    console.error('Jira Done count error:', response.error);
                } else {
                    this.workJiraDoneCount.style.display = 'inline';
                    this.workJiraDoneCount.textContent = `${response.count}`;
                    console.log('Work Jira Done count:', response.count);
                }
            } else {
                this.workJiraDoneCount.style.display = 'none';
                console.error('Invalid response from background script for Jira');
            }
            
        } catch (error) {
            this.workJiraDoneCount.style.display = 'none';
            console.error('Error fetching work Jira Done count:', error);
        }
    }
    
    async updatePocketMoney(): Promise<void> {
        try {
            const response = await fetch('https://howapped.zapto.org/kaizen/pocketmoney/joseph');
            if (response.ok) {
                const data = await response.json();
                this.pocketMoney.textContent = `${data.POCKETMONEY}`;
            } else {
                this.pocketMoney.textContent = 'Error';
            }
        } catch (error) {
            this.pocketMoney.textContent = '--';
            console.error('Error fetching pocket money:', error);
        }
    }
}