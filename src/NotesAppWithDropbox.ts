import { VimMode } from "./VimMode";
import { DropboxService, DropboxEntry } from "./DropboxService";

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
  taskCount: HTMLElement;
  inboxCount: HTMLElement;
  workInboxCount: HTMLElement;
  workJiraDoneCount: HTMLElement;
  workInboxMetric: HTMLElement;
  workJiraMetric: HTMLElement;
  pocketMoney: HTMLElement;

  vimEnabled: boolean = false;
  workContextEnabled: boolean = true;
  vimMode: string = "normal";
  saveTimeout: number | null = null;
  metricsInterval: number | null = null;
  vim: VimMode | null = null;

  dropboxService: DropboxService | null = null;
  dropboxSyncEnabled: boolean = false;
  autoSync: boolean = true;
  syncFrequency: number = 30; // seconds
  currentFilePath: string | null = null;
  lastSyncedContent: string = "";
  syncInterval: number | null = null;
  isSyncing: boolean = false;

  constructor() {
    this.notepad = document.getElementById("notepad") as HTMLTextAreaElement;
    this.saveStatus = document.getElementById("saveStatus") as HTMLElement;
    this.vimModeIndicator = document.getElementById("vimMode") as HTMLElement;
    this.dateTemplateBtn = document.getElementById(
      "dateTemplateBtn"
    ) as HTMLButtonElement;
    this.taskCount = document.getElementById("taskCount") as HTMLElement;
    this.inboxCount = document.getElementById("inboxCount") as HTMLElement;
    this.workInboxCount = document.getElementById(
      "workInboxCount"
    ) as HTMLElement;
    this.workJiraDoneCount = document.getElementById(
      "workJiraDoneCount"
    ) as HTMLElement;
    this.workInboxMetric = this.workInboxCount.parentElement as HTMLElement;
    this.workJiraMetric = this.workJiraDoneCount.parentElement as HTMLElement;
    this.pocketMoney = document.getElementById("pocketMoney") as HTMLElement;
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
      if (message.type === "SYNC_FREQUENCY_CHANGED") {
        this.syncFrequency = message.frequency;
        if (this.dropboxSyncEnabled && this.autoSync) {
          this.startAutoSync(); // Restart with new frequency
        }
      }
    });
  }

  async loadSettings(): Promise<void> {
    const result = await chrome.storage.sync.get([
      "vimEnabled",
      "workContextEnabled",
      "autoSync",
      "syncFrequency",
    ]);
    this.vimEnabled = result.vimEnabled || false;
    this.workContextEnabled = result.workContextEnabled !== false; // Default to true
    this.autoSync = result.autoSync !== false;
    this.syncFrequency = result.syncFrequency || 30;
    console.log('Settings loaded - workContextEnabled:', this.workContextEnabled);
  }

  async initDropbox(): Promise<void> {
    const result = await chrome.storage.local.get([
      "dropboxAccessToken",
      "dropboxRefreshToken",
      "dropboxFilePath",
    ]);

    if (result.dropboxAccessToken) {
      const extensionId = chrome.runtime.id;
      const redirectUri = `https://${extensionId}.chromiumapp.org/`;

      const clientId = window.DROPBOX_CONFIG?.APP_KEY || "YOUR_DROPBOX_APP_KEY";

      if (clientId === "YOUR_DROPBOX_APP_KEY") {
        console.warn("Dropbox app key not configured. Please set up config.js");
      }

      this.dropboxService = new DropboxService({
        clientId: clientId,
        redirectUri: redirectUri,
        accessToken: result.dropboxAccessToken,
        refreshToken: result.dropboxRefreshToken,
      });

      this.currentFilePath = result.dropboxFilePath || null;
      this.dropboxSyncEnabled = !!this.currentFilePath;
    }
  }

  async loadNotes(): Promise<void> {
    if (
      this.dropboxSyncEnabled &&
      this.dropboxService &&
      this.currentFilePath
    ) {
      await this.syncFromDropbox();
    } else {
      const result = await chrome.storage.local.get(["notes"]);
      if (result.notes) {
        this.notepad.value = result.notes;
        this.lastSyncedContent = result.notes;
      }
    }
    this.updateTaskCount();
  }

  setupEventListeners(): void {
    this.notepad.addEventListener("input", () => {
      this.saveNotes();
      this.updateTaskCount();
    });

    this.dateTemplateBtn.addEventListener("click", () => {
      this.insertDateTemplate();
    });

    // Add manual sync shortcut (Ctrl+S or Cmd+S)
    this.notepad.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (this.dropboxSyncEnabled) {
          this.syncFromDropbox();
          this.showSaveStatus("Manual sync triggered");
        }
        return;
      }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "sync") {
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
        if (changes.autoSync) {
          this.autoSync = changes.autoSync.newValue;
          if (this.autoSync && this.dropboxSyncEnabled) {
            this.startAutoSync();
          } else {
            this.stopAutoSync();
          }
        }
      }

      if (namespace === "local") {
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
      if (message.type === "DROPBOX_SYNC_COMPLETE") {
        this.syncFromDropbox();
      }
    });

    window.addEventListener("beforeunload", () => {
      if (this.hasUnsyncedChanges()) {
        this.syncToDropbox();
      }
    });

    document.addEventListener("visibilitychange", () => {
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
        this.showSaveStatus("Saved locally");
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
      const metadata = await this.dropboxService.getFileMetadata(
        this.currentFilePath
      );

      if (metadata) {
        await this.dropboxService.updateFile(
          this.currentFilePath,
          content,
          metadata.rev
        );
      } else {
        await this.dropboxService.createFile(this.currentFilePath, content);
      }

      this.lastSyncedContent = content;
      await chrome.storage.local.set({ lastSyncTime: Date.now() });
      this.showSaveStatus("Synced to Dropbox");
    } catch (error: any) {
      if (error.message === "FILE_CONFLICT") {
        await this.handleConflict();
      } else {
        console.error("Failed to sync to Dropbox:", error);
        this.showSaveStatus("Sync failed", true);
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

        if (
          localContent !== this.lastSyncedContent &&
          localContent !== content
        ) {
          const useRemote = confirm(
            "Your local notes have changed and differ from Dropbox.\n\n" +
              "Do you want to use the Dropbox version?\n\n" +
              "Click OK to use Dropbox version, Cancel to keep local version."
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
      console.error("Failed to sync from Dropbox:", error);
    } finally {
      this.isSyncing = false;
    }
  }

  async handleConflict(): Promise<void> {
    const useLocal = confirm(
      "There was a conflict with the Dropbox file.\n\n" +
        "Another device may have updated the file.\n\n" +
        "Do you want to overwrite with your local version?\n\n" +
        "Click OK to overwrite, Cancel to download the remote version."
    );

    if (useLocal) {
      try {
        const content = this.notepad.value;
        await this.dropboxService!.updateFile(this.currentFilePath!, content);
        this.lastSyncedContent = content;
        this.showSaveStatus("Conflict resolved - local version saved");
      } catch (error) {
        console.error("Failed to resolve conflict:", error);
        this.showSaveStatus("Failed to resolve conflict", true);
      }
    } else {
      await this.syncFromDropbox();
      this.showSaveStatus("Conflict resolved - remote version loaded");
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
    this.saveStatus.classList.add("visible");

    if (isError) {
      this.saveStatus.style.color = "#f44336";
    } else {
      this.saveStatus.style.color = "";
    }

    setTimeout(() => {
      this.saveStatus.classList.remove("visible");
    }, 2000);
  }

  initVimMode(): void {
    this.vim = new VimMode(
      this.notepad, 
      this.vimModeIndicator, 
      (deletedLine: string, fullContent: string, cursorPosition: number) => {
        this.archiveDeletedTask(deletedLine, fullContent, cursorPosition);
      }
    );
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
    const days = Math.floor(
      (date.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
    );
    const weekNumber = Math.ceil((days + startDate.getDay() + 1) / 7);

    // Format date components
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" });

    // Create template with horizontal line
    const template = `## ${year}-${month}-${day}-W${weekNumber}-${weekday}\n\n- todo.\n\n---\n\n`;

    const currentContent = this.notepad.value;
    this.notepad.value = template + currentContent;

    // Move cursor after "- todo."
    const cursorPosition = template.indexOf("- todo.") + 7;
    this.notepad.setSelectionRange(cursorPosition, cursorPosition);
    this.notepad.focus();

    // Trigger save
    this.saveNotes();
  }

  startMetricsPolling(): void {
    console.log("Starting metrics polling...");
    this.updateWorkMetricsVisibility();

    console.log("Calling updateMetrics() immediately...");
    this.updateMetrics();
    console.log("Setting up 30-second interval...");
    this.metricsInterval = window.setInterval(() => {
      console.log("Interval triggered - calling updateMetrics()...");
      this.updateMetrics();
    }, 30000); // Poll every 30 seconds for testing
  }

  updateWorkMetricsVisibility(): void {
    console.log('updateWorkMetricsVisibility called, workContextEnabled:', this.workContextEnabled);
    if (this.workContextEnabled) {
      // Make work metrics visible with loading state
      console.log('Showing work metrics');
      this.workInboxMetric.style.display = "inline";
      this.workJiraMetric.style.display = "inline";
      this.workInboxCount.textContent = "Loading...";
      this.workJiraDoneCount.textContent = "Loading...";
    } else {
      // Hide work metrics when work context is disabled
      console.log('Hiding work metrics');
      this.workInboxMetric.style.display = "none";
      this.workJiraMetric.style.display = "none";
    }
  }

  async updateMetrics(): Promise<void> {
    console.log("Updating metrics...");
    try {
      const promises = [
        this.updateInboxCount(),
        this.updatePocketMoney(),
      ];
      
      // Only add work-related metrics if work context is enabled
      if (this.workContextEnabled) {
        promises.push(
          this.updateWorkInboxCount(),
          this.updateWorkJiraDoneCount()
        );
      }
      
      await Promise.all(promises);
      console.log("All metrics updated successfully");
    } catch (error) {
      console.error("Error updating metrics:", error);
      // Show error state instead of staying on "Loading..."
      if (this.workContextEnabled) {
        this.workInboxCount.textContent = "Error";
        this.workJiraDoneCount.textContent = "Error";
      }
    }
  }

  updateTaskCount(): void {
    const content = this.notepad.value;
    const lines = content.split("\n");
    const taskCount = lines.filter((line) => {
      const trimmed = line.trimStart();
      return trimmed.startsWith("-") && !trimmed.match(/^-{3,}$/);
    }).length;
    this.taskCount.textContent = `${taskCount}`;
  }

  async updateInboxCount(): Promise<void> {
    try {
      console.log("Fetching personal inbox count...");
      const response = await fetch(
        "https://howapped.zapto.org/kaizen/inbox/count"
      );
      if (response.ok) {
        const data = await response.json();
        console.log("Personal inbox count response:", data);
        this.inboxCount.textContent = `${data.INBOX}`;
      } else {
        console.error(
          "Personal inbox count request failed:",
          response.status,
          response.statusText
        );
        this.inboxCount.textContent = "Error";
      }
    } catch (error) {
      this.inboxCount.textContent = "--";
      console.error("Error fetching personal inbox count:", error);
    }
  }

  async updateWorkInboxCount(): Promise<void> {
    console.log('updateWorkInboxCount called, workContextEnabled:', this.workContextEnabled);
    if (!this.workContextEnabled) {
      console.log('Work context disabled, skipping Gmail polling');
      return;
    }
    
    try {
      console.log("STARTING: updateWorkInboxCount");
      console.log("Fetching work Gmail inbox count using background tab...");

      // Send message to background script to get Gmail count via background tab
      console.log("Sending message to background script for Gmail count...");
      const response = await Promise.race([
        chrome.runtime.sendMessage({
          type: "GET_GMAIL_COUNT_FROM_BACKGROUND",
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Gmail count request timeout")),
            10000
          )
        ),
      ]);
      console.log("Gmail count response received:", response);

      if (response && response.type === "GMAIL_COUNT_RESULT") {
        if (response.error) {
          this.workInboxCount.style.display = "none";
          console.error("Work Gmail count error:", response.error);
        } else if (response.count === -1) {
          this.workInboxCount.style.display = "none";
        } else if (response.count === 0 && response.accountNotFound) {
          // Hide the metric if the correct Gmail account isn't found
          this.workInboxCount.style.display = "none";
          console.log("Work Gmail account not found, hiding metric");
        } else {
          this.workInboxCount.style.display = "inline";
          this.workInboxCount.textContent = `${response.count}`;
          console.log("Work Gmail inbox count:", response.count);
        }
      } else {
        this.workInboxCount.style.display = "none";
        console.error("Invalid response from background script");
      }
    } catch (error) {
      this.workInboxCount.textContent = "--";
      console.error("Error fetching work Gmail inbox count:", error);
    }
  }

  async updateWorkJiraDoneCount(): Promise<void> {
    console.log('updateWorkJiraDoneCount called, workContextEnabled:', this.workContextEnabled);
    if (!this.workContextEnabled) {
      console.log('Work context disabled, skipping Jira polling');
      return;
    }
    
    try {
      console.log("STARTING: updateWorkJiraDoneCount");
      console.log("Fetching work Jira Done count using background tab...");

      // Send message to background script to get Jira Done count
      console.log("Sending message to background script for Jira count...");
      const response = await Promise.race([
        chrome.runtime.sendMessage({
          type: "GET_JIRA_DONE_COUNT_FROM_BACKGROUND",
        }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Jira count request timeout")),
            10000
          )
        ),
      ]);
      console.log("Jira count response received:", response);

      if (response && response.type === "JIRA_DONE_COUNT_RESULT") {
        if (response.error || !response.count) {
          this.workJiraDoneCount.style.display = "none";
          console.error("Jira Done count error:", response.error);
        } else {
          this.workJiraDoneCount.style.display = "inline";
          this.workJiraDoneCount.textContent = `${response.count}`;
          console.log("Work Jira Done count:", response.count);
        }
      } else {
        this.workJiraDoneCount.style.display = "none";
        console.error("Invalid response from background script for Jira");
      }
    } catch (error) {
      this.workJiraDoneCount.style.display = "none";
      console.error("Error fetching work Jira Done count:", error);
    }
  }

  async updatePocketMoney(): Promise<void> {
    try {
      console.log("Fetching pocket money...");
      const response = await fetch(
        "https://howapped.zapto.org/kaizen/pocketmoney/joseph"
      );
      if (response.ok) {
        const data = await response.json();
        console.log("Pocket money response:", data);
        this.pocketMoney.textContent = `${data.POCKETMONEY}`;
      } else {
        console.error(
          "Pocket money request failed:",
          response.status,
          response.statusText
        );
        this.pocketMoney.textContent = "Error";
      }
    } catch (error) {
      this.pocketMoney.textContent = "--";
      console.error("Error fetching pocket money:", error);
    }
  }

  async archiveDeletedTask(deletedLine: string, fullContent: string, cursorPosition: number): Promise<void> {
    // Only archive if it looks like a task (starts with "- " and has content)
    const trimmedLine = deletedLine.trim();
    if (!trimmedLine.startsWith('- ') || trimmedLine === '- ') {
      return;
    }

    // Find the date context for this deleted task, or use today's date
    let dateContext = this.findDateContextForTask(fullContent, cursorPosition);
    if (!dateContext) {
      dateContext = this.getTodaysDateContext();
      console.log('No date context found for deleted task, using today\'s date:', dateContext);
    }

    // Format the task as completed
    const completedTask = trimmedLine.replace(/^- /, '- [x] ');

    try {
      await this.addToArchive(dateContext, completedTask);
      console.log(`Archived completed task: ${completedTask}`);
    } catch (error) {
      console.error('Failed to archive task:', error);
    }
  }

  getTodaysDateContext(): string {
    const today = new Date();
    
    // Get week number
    const startDate = new Date(today.getFullYear(), 0, 1);
    const days = Math.floor((today.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startDate.getDay() + 1) / 7);
    
    // Format date components
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const weekday = today.toLocaleDateString('en-US', { weekday: 'short' });
    
    // Return in same format as main file: YYYY-MM-DD-WXX-Day
    return `${year}-${month}-${day}-W${weekNumber}-${weekday}`;
  }

  findDateContextForTask(content: string, cursorPosition: number): string | null {
    const lines = content.split('\n');
    let currentPos = 0;
    let lineIndex = 0;

    // Find which line the cursor was on
    for (let i = 0; i < lines.length; i++) {
      if (currentPos + lines[i].length >= cursorPosition) {
        lineIndex = i;
        break;
      }
      currentPos += lines[i].length + 1; // +1 for newline
    }

    // Look backwards from the cursor line to find the most recent date header
    for (let i = lineIndex; i >= 0; i--) {
      const line = lines[i].trim();
      // Match date format: ## YYYY-MM-DD-WXX-Day
      if (line.match(/^## \d{4}-\d{2}-\d{2}-W\d{1,2}-\w+/)) {
        return line.replace(/^## /, '');
      }
    }

    return null;
  }

  async addToArchive(dateContext: string, completedTask: string): Promise<void> {
    if (!this.dropboxSyncEnabled || !this.currentFilePath || !this.dropboxService) {
      return;
    }

    const archivePath = this.getArchiveFilePath(this.currentFilePath);
    const startTime = Date.now();

    try {
      // Try to read existing archive file
      let archiveContent = '';
      try {
        archiveContent = await this.dropboxService.readFile(archivePath);
      } catch (error) {
        // Archive file doesn't exist yet, will create it
        console.log('Archive file does not exist, will create new one');
      }

      // Update archive content
      const updatedContent = this.insertTaskIntoArchive(archiveContent, dateContext, completedTask, startTime);

      // Save updated archive
      if (archiveContent === '') {
        // Create new file
        await this.dropboxService.createFile(archivePath, updatedContent);
      } else {
        // Update existing file
        await this.dropboxService.updateFile(archivePath, updatedContent);
      }

    } catch (error) {
      console.error('Error updating archive file:', error);
      throw error;
    }
  }

  getArchiveFileName(originalFileName: string): string {
    const parts = originalFileName.split('.');
    if (parts.length > 1) {
      parts[parts.length - 2] += '.archive';
      return parts.join('.');
    }
    return originalFileName + '.archive';
  }

  getArchiveFilePath(originalFilePath: string): string {
    const parts = originalFilePath.split('.');
    if (parts.length > 1) {
      parts[parts.length - 2] += '.archive';
      return parts.join('.');
    }
    return originalFilePath + '.archive';
  }

  insertTaskIntoArchive(archiveContent: string, dateContext: string, completedTask: string, startTime: number): string {
    const dateHeader = `## ${dateContext}`;
    
    // Parse existing content into date sections (skip the timestamp line if it exists)
    const contentWithoutTimestamp = this.removeTimestampFromArchive(archiveContent);
    const sections = this.parseArchiveIntoSections(contentWithoutTimestamp);
    
    // Find or create the section for this date
    let targetSection = sections.find(section => section.header === dateHeader);
    if (!targetSection) {
      targetSection = {
        header: dateHeader,
        date: this.parseDateFromHeader(dateHeader),
        tasks: []
      };
      sections.push(targetSection);
    }
    
    // Add the new task to the section
    targetSection.tasks.push(completedTask);
    
    // Sort sections by date (most recent first)
    sections.sort((a, b) => {
      if (a.date && b.date) {
        return b.date.getTime() - a.date.getTime();
      }
      return 0;
    });
    
    // Generate timestamp header
    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const timestampHeader = this.generateTimestampHeader(durationMs);
    
    // Rebuild the archive content with timestamp
    const archiveBody = this.rebuildArchiveFromSections(sections);
    const result = timestampHeader + '\n\n' + archiveBody;
    
    return result;
  }

  removeTimestampFromArchive(content: string): string {
    const lines = content.split('\n');
    // Remove first line if it starts with "Last updated:"
    if (lines.length > 0 && lines[0].startsWith('Last updated:')) {
      // Also remove the empty line that follows the timestamp
      if (lines.length > 1 && lines[1].trim() === '') {
        return lines.slice(2).join('\n');
      }
      return lines.slice(1).join('\n');
    }
    return content;
  }

  generateTimestampHeader(durationMs: number): string {
    const now = new Date();
    const humanDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });
    const humanTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    
    // Convert duration to human readable format
    let durationText;
    if (durationMs < 1000) {
      durationText = `${durationMs}ms`;
    } else if (durationMs < 60000) {
      const seconds = (durationMs / 1000).toFixed(2);
      durationText = `${seconds} seconds`;
    } else {
      const minutes = Math.floor(durationMs / 60000);
      const seconds = ((durationMs % 60000) / 1000).toFixed(2);
      durationText = `${minutes} minutes, ${seconds} seconds`;
    }
    
    return `Last updated: ${humanDate} at ${humanTime} (took ${durationText})`;
  }

  parseArchiveIntoSections(content: string): { header: string; date: Date | null; tasks: string[] }[] {
    const lines = content.split('\n');
    const sections: { header: string; date: Date | null; tasks: string[] }[] = [];
    let currentSection: { header: string; date: Date | null; tasks: string[] } | null = null;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check if this is a date header
      if (trimmedLine.match(/^## \d{4}-\d{2}-\d{2}-W\d{1,2}-\w+/)) {
        // Save previous section if exists
        if (currentSection) {
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          header: trimmedLine,
          date: this.parseDateFromHeader(trimmedLine),
          tasks: []
        };
      } else if (currentSection && trimmedLine.startsWith('- [x]')) {
        // Add task to current section
        currentSection.tasks.push(trimmedLine);
      }
      // Skip empty lines and other content
    }
    
    // Don't forget the last section
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  }

  parseDateFromHeader(header: string): Date | null {
    // Extract date from header like "## 2025-09-05-W36-Fri"
    const match = header.match(/^## (\d{4})-(\d{2})-(\d{2})-W\d{1,2}-(\w+)/);
    if (match) {
      const [, year, month, day, weekday] = match;
      const baseDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      
      // Verify the weekday matches (for data integrity)
      const expectedWeekday = baseDate.toLocaleDateString('en-US', { weekday: 'short' });
      if (expectedWeekday !== weekday) {
        console.warn(`Date mismatch: ${header} has weekday ${weekday} but should be ${expectedWeekday}`);
      }
      
      return baseDate;
    }
    return null;
  }

  rebuildArchiveFromSections(sections: { header: string; date: Date | null; tasks: string[] }[]): string {
    const result: string[] = [];
    
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      // Add header
      result.push(section.header);
      
      // Add tasks
      for (const task of section.tasks) {
        result.push(task);
      }
      
      // Add empty line between sections (but not after the last one)
      if (i < sections.length - 1) {
        result.push('');
      }
    }
    
    return result.join('\n');
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    new NotesAppWithDropbox().init();
  });
} else {
  new NotesAppWithDropbox().init();
}
