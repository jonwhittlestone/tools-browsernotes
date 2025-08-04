import { NotesAppWithDropbox } from '../NotesAppWithDropbox';
import { DropboxService } from '../DropboxService';

// Mock the DropboxService
jest.mock('../DropboxService');
jest.mock('../VimMode');

describe('NotesAppWithDropbox', () => {
  let notesApp: NotesAppWithDropbox;
  let mockTextarea: HTMLTextAreaElement;
  let mockSaveStatus: HTMLElement;
  let mockVimIndicator: HTMLElement;
  let mockDropboxService: jest.Mocked<DropboxService>;

  beforeEach(() => {
    jest.useFakeTimers();
    
    document.body.innerHTML = `
      <textarea id="notepad"></textarea>
      <span id="saveStatus"></span>
      <span id="vimMode"></span>
    `;
    
    mockTextarea = document.getElementById('notepad') as HTMLTextAreaElement;
    mockSaveStatus = document.getElementById('saveStatus') as HTMLElement;
    mockVimIndicator = document.getElementById('vimMode') as HTMLElement;
    
    // Create mock DropboxService instance
    mockDropboxService = {
      authenticate: jest.fn(),
      isAuthenticated: jest.fn(),
      loadTokens: jest.fn(),
      readFile: jest.fn(),
      updateFile: jest.fn(),
      signOut: jest.fn(),
    } as any;

    (DropboxService as jest.MockedClass<typeof DropboxService>).mockImplementation(() => mockDropboxService);
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllTimers();
  });

  describe('initialization', () => {
    it('should initialize with default settings', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        vimEnabled: false,
        autoSync: true,
        syncFrequency: 30,
      });
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        notes: 'Initial notes',
        dropboxAccessToken: null,
      });

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();

      expect(notesApp.vimEnabled).toBe(false);
      expect(notesApp.autoSync).toBe(true);
      expect(notesApp.syncFrequency).toBe(30);
      expect(mockTextarea.value).toBe('Initial notes');
    });

    it('should initialize Dropbox when tokens exist', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        vimEnabled: false,
        autoSync: true,
        syncFrequency: 15,
      });
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        notes: 'Initial notes',
        dropboxAccessToken: 'test-token',
        dropboxRefreshToken: 'test-refresh',
        dropboxFilePath: '/notes.md',
      });

      mockDropboxService.isAuthenticated.mockReturnValue(true);
      mockDropboxService.readFile.mockResolvedValue('Synced content');

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();

      expect(notesApp.dropboxSyncEnabled).toBe(true);
      expect(notesApp.currentFilePath).toBe('/notes.md');
      expect(mockDropboxService.loadTokens).toHaveBeenCalled();
    });

    it('should start auto-sync when conditions are met', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        vimEnabled: false,
        autoSync: true,
        syncFrequency: 10,
      });
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        dropboxAccessToken: 'test-token',
        dropboxFilePath: '/notes.md',
      });

      mockDropboxService.isAuthenticated.mockReturnValue(true);

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();

      expect(notesApp.syncInterval).not.toBeNull();
      expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 10000);
    });
  });

  describe('sync functionality', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        vimEnabled: false,
        autoSync: true,
        syncFrequency: 30,
      });
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        notes: 'Initial notes',
        dropboxAccessToken: 'test-token',
        dropboxFilePath: '/notes.md',
      });

      mockDropboxService.isAuthenticated.mockReturnValue(true);
      mockDropboxService.readFile.mockResolvedValue('Synced content');

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();
    });

    it('should sync from Dropbox successfully', async () => {
      const syncedContent = 'Updated content from Dropbox';
      mockDropboxService.readFile.mockResolvedValue(syncedContent);

      await notesApp.syncFromDropbox();

      expect(mockDropboxService.readFile).toHaveBeenCalledWith('/notes.md');
      expect(mockTextarea.value).toBe(syncedContent);
      expect(notesApp.lastSyncedContent).toBe(syncedContent);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notes: syncedContent,
        lastSyncTime: expect.any(Number),
      });
    });

    it('should handle sync errors gracefully', async () => {
      mockDropboxService.readFile.mockRejectedValue(new Error('Sync failed'));

      await notesApp.syncFromDropbox();

      expect(mockSaveStatus.textContent).toContain('Sync failed');
      expect(mockSaveStatus.style.color).toBe('rgb(244, 67, 54)');
    });

    it('should update sync frequency dynamically', async () => {
      const originalInterval = notesApp.syncInterval;

      // Simulate message from settings
      const messageHandler = (chrome.runtime.onMessage.addListener as jest.Mock).mock.calls[0][0];
      messageHandler({ type: 'SYNC_FREQUENCY_CHANGED', frequency: 5 });

      expect(notesApp.syncFrequency).toBe(5);
      expect(window.clearInterval).toHaveBeenCalledWith(originalInterval);
      expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('should handle manual sync trigger', async () => {
      const syncSpy = jest.spyOn(notesApp, 'syncFromDropbox');
      mockDropboxService.readFile.mockResolvedValue('Manual sync content');

      // Simulate Ctrl+S keypress
      const keyEvent = new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
      });
      mockTextarea.dispatchEvent(keyEvent);

      expect(syncSpy).toHaveBeenCalled();
    });

    it('should not sync when document is hidden', async () => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
      });

      const syncSpy = jest.spyOn(notesApp, 'syncFromDropbox');

      // Trigger interval
      const intervalCallback = (window.setInterval as jest.Mock).mock.calls[0][0];
      intervalCallback();

      expect(syncSpy).not.toHaveBeenCalled();
    });
  });

  describe('settings changes', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        vimEnabled: false,
        autoSync: true,
        syncFrequency: 30,
      });
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        notes: 'Initial notes',
      });

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();
    });

    it('should handle autoSync setting change', () => {
      const storageHandler = (chrome.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];
      
      storageHandler(
        {
          autoSync: { newValue: false },
        },
        'sync'
      );

      expect(notesApp.autoSync).toBe(false);
      expect(window.clearInterval).toHaveBeenCalled();
    });

    it('should handle dropbox file path change', () => {
      const storageHandler = (chrome.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];
      
      storageHandler(
        {
          dropboxFilePath: { newValue: '/new-notes.md' },
        },
        'local'
      );

      expect(notesApp.currentFilePath).toBe('/new-notes.md');
      expect(notesApp.dropboxSyncEnabled).toBe(true);
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();
    });

    it('should check for unsynced changes', () => {
      notesApp.lastSyncedContent = 'original content';
      mockTextarea.value = 'modified content';

      expect(notesApp.hasUnsyncedChanges()).toBe(true);

      mockTextarea.value = 'original content';
      expect(notesApp.hasUnsyncedChanges()).toBe(false);
    });

    it('should show save status messages', () => {
      notesApp.showSaveStatus('Test message');

      expect(mockSaveStatus.textContent).toBe('Test message');
      expect(mockSaveStatus.classList.contains('visible')).toBe(true);

      notesApp.showSaveStatus('Error message', true);
      expect(mockSaveStatus.style.color).toBe('rgb(244, 67, 54)');
    });

    it('should start and stop auto-sync', () => {
      notesApp.startAutoSync();
      expect(notesApp.syncInterval).not.toBeNull();
      expect(window.setInterval).toHaveBeenCalled();

      const intervalId = notesApp.syncInterval;
      notesApp.stopAutoSync();
      expect(notesApp.syncInterval).toBeNull();
      expect(window.clearInterval).toHaveBeenCalledWith(intervalId);
    });
  });

  describe('vim mode integration', () => {
    it('should initialize vim mode when enabled', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        vimEnabled: true,
        autoSync: false,
        syncFrequency: 30,
      });
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();

      expect(notesApp.vimEnabled).toBe(true);
      expect(notesApp.vim).not.toBeNull();
    });

    it('should handle vim mode toggle', () => {
      const storageHandler = (chrome.storage.onChanged.addListener as jest.Mock).mock.calls[0][0];
      
      storageHandler(
        {
          vimEnabled: { newValue: true },
        },
        'sync'
      );

      expect(notesApp.vimEnabled).toBe(true);
    });
  });

  describe('note saving', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      notesApp = new NotesAppWithDropbox();
      await notesApp.init();
    });

    it('should save notes with debouncing', () => {
      mockTextarea.value = 'New content';
      
      // Trigger input event
      const inputEvent = new Event('input');
      mockTextarea.dispatchEvent(inputEvent);

      // Should not save immediately
      expect(chrome.storage.local.set).not.toHaveBeenCalled();

      // Fast forward through debounce delay
      jest.advanceTimersByTime(1500);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notes: 'New content',
      });
    });

    it('should show save status after saving', () => {
      mockTextarea.value = 'New content';
      
      const inputEvent = new Event('input');
      mockTextarea.dispatchEvent(inputEvent);
      
      jest.advanceTimersByTime(1500);

      expect(mockSaveStatus.textContent).toBe('Saved');
      expect(mockSaveStatus.classList.contains('visible')).toBe(true);
    });
  });
});