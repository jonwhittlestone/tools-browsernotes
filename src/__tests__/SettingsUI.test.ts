import { SettingsUI } from '../SettingsUI';
import { DropboxService } from '../DropboxService';

// Mock the DropboxService
jest.mock('../DropboxService');

describe('SettingsUI', () => {
  let settingsUI: SettingsUI;
  let mockDropboxService: jest.Mocked<DropboxService>;

  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <input type="checkbox" id="vimMode">
      <input type="checkbox" id="autoSync">
      <select id="syncFrequency">
        <option value="5">Every 5 seconds</option>
        <option value="10">Every 10 seconds</option>
        <option value="30" selected>Every 30 seconds</option>
      </select>
      <div id="vimHelp" style="display: none;"></div>
      <button id="connectDropbox"></button>
      <button id="disconnectDropbox"></button>
      <button id="refreshFiles"></button>
      <button id="createFile"></button>
      <select id="dropboxFiles"></select>
      <button id="syncNow"></button>
      <div id="folderList"></div>
      <input type="text" id="newFileName">
      <input type="text" id="newFilePath">
      <div id="dropboxAuth"></div>
      <div id="dropboxConnected"></div>
      <div id="dropboxFileSection"></div>
      <div id="syncSettings"></div>
      <div id="syncFrequencySettings"></div>
      <div id="syncStatus"></div>
      <div id="dropboxStatus"></div>
      <div id="currentFile"></div>
      <span id="currentFilePath"></span>
      <span id="lastSyncTime"></span>
      <div class="breadcrumb">
        <span class="breadcrumb-item clickable" data-path="">Dropbox</span>
        <span id="breadcrumbPath"></span>
      </div>
    `;

    // Mock DropboxService
    mockDropboxService = {
      authenticate: jest.fn(),
      isAuthenticated: jest.fn(),
      loadTokens: jest.fn(),
      listEntries: jest.fn(),
      createFile: jest.fn(),
      signOut: jest.fn(),
    } as any;

    (DropboxService as jest.MockedClass<typeof DropboxService>).mockImplementation(() => mockDropboxService);

    // Mock window.DROPBOX_CONFIG
    (globalThis as any).window = {
      DROPBOX_CONFIG: {
        APP_KEY: 'test-app-key',
      },
    };

    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with stored settings', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({
        vimEnabled: true,
        autoSync: false,
        syncFrequency: 15,
      });

      mockDropboxService.isAuthenticated.mockReturnValue(false);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for async init

      const vimCheckbox = document.getElementById('vimMode') as HTMLInputElement;
      const autoSyncCheckbox = document.getElementById('autoSync') as HTMLInputElement;
      const syncFrequencySelect = document.getElementById('syncFrequency') as HTMLSelectElement;

      expect(vimCheckbox.checked).toBe(true);
      expect(autoSyncCheckbox.checked).toBe(false);
      expect(syncFrequencySelect.value).toBe('15');
    });

    it('should show connected state when authenticated', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(true);
      mockDropboxService.listEntries.mockResolvedValue([]);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));

      const authDiv = document.getElementById('dropboxAuth');
      const connectedDiv = document.getElementById('dropboxConnected');
      const fileSection = document.getElementById('dropboxFileSection');

      expect(authDiv?.style.display).toBe('none');
      expect(connectedDiv?.style.display).toBe('flex');
      expect(fileSection?.style.display).toBe('block');
    });

    it('should show disconnected state when not authenticated', async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(false);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));

      const authDiv = document.getElementById('dropboxAuth');
      const connectedDiv = document.getElementById('dropboxConnected');
      const fileSection = document.getElementById('dropboxFileSection');

      expect(authDiv?.style.display).toBe('block');
      expect(connectedDiv?.style.display).toBe('none');
      expect(fileSection?.style.display).toBe('none');
    });
  });

  describe('setting changes', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(false);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should save vim mode changes', async () => {
      const vimCheckbox = document.getElementById('vimMode') as HTMLInputElement;
      const vimHelp = document.getElementById('vimHelp');

      vimCheckbox.checked = true;
      vimCheckbox.dispatchEvent(new Event('change'));

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ vimEnabled: true });
      expect(vimHelp?.style.display).toBe('block');
    });

    it('should save auto-sync changes', async () => {
      const autoSyncCheckbox = document.getElementById('autoSync') as HTMLInputElement;

      autoSyncCheckbox.checked = false;
      autoSyncCheckbox.dispatchEvent(new Event('change'));

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ autoSync: false });
    });

    it('should save sync frequency changes and notify main app', async () => {
      const syncFrequencySelect = document.getElementById('syncFrequency') as HTMLSelectElement;

      syncFrequencySelect.value = '10';
      syncFrequencySelect.dispatchEvent(new Event('change'));

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ syncFrequency: 10 });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'SYNC_FREQUENCY_CHANGED',
        frequency: 10,
      });
    });
  });

  describe('Dropbox connection', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(false);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should connect to Dropbox successfully', async () => {
      mockDropboxService.authenticate.mockResolvedValue(true);
      mockDropboxService.isAuthenticated.mockReturnValue(true);
      mockDropboxService.listEntries.mockResolvedValue([]);

      const connectButton = document.getElementById('connectDropbox');
      const statusDiv = document.getElementById('dropboxStatus');

      connectButton?.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockDropboxService.authenticate).toHaveBeenCalled();
      expect(statusDiv?.textContent).toBe('Successfully connected!');
      expect(statusDiv?.style.color).toBe('rgb(76, 175, 80)');
    });

    it('should handle connection failure', async () => {
      mockDropboxService.authenticate.mockRejectedValue(new Error('Connection failed'));

      const connectButton = document.getElementById('connectDropbox');
      const statusDiv = document.getElementById('dropboxStatus');

      connectButton?.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(statusDiv?.textContent).toContain('Error: Connection failed');
      expect(statusDiv?.style.color).toBe('rgb(244, 67, 54)');
    });

    it('should disconnect from Dropbox', async () => {
      const disconnectButton = document.getElementById('disconnectDropbox');

      disconnectButton?.click();

      expect(mockDropboxService.signOut).toHaveBeenCalled();
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['dropboxFilePath', 'lastSyncTime']);
    });
  });

  describe('folder navigation', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(true);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should load folder content with files and folders', async () => {
      const mockEntries = [
        {
          id: 'folder1',
          name: 'Documents',
          path: '/Documents',
          type: 'folder' as const,
        },
        {
          id: 'file1',
          name: 'notes.md',
          path: '/notes.md',
          type: 'file' as const,
        },
        {
          id: 'file2',
          name: 'readme.txt',
          path: '/readme.txt',
          type: 'file' as const,
        },
      ];

      mockDropboxService.listEntries.mockResolvedValue(mockEntries);
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});

      await (settingsUI as any).loadFolderContent('/');

      const folderList = document.getElementById('folderList');
      const filesSelect = document.getElementById('dropboxFiles') as HTMLSelectElement;

      expect(folderList?.children.length).toBe(1); // Only folder
      expect(folderList?.children[0].textContent).toContain('Documents');
      
      expect(filesSelect.children.length).toBe(2); // Default option + md file
      expect(Array.from(filesSelect.options).some(opt => opt.textContent === 'notes.md')).toBe(true);
    });

    it('should navigate to folder when clicked', async () => {
      const mockEntries = [
        {
          id: 'folder1',
          name: 'Documents',
          path: '/Documents',
          type: 'folder' as const,
        },
      ];

      mockDropboxService.listEntries
        .mockResolvedValueOnce(mockEntries)
        .mockResolvedValueOnce([]);

      await (settingsUI as any).loadFolderContent('/');

      const folderDiv = document.querySelector('.folder-item');
      folderDiv?.dispatchEvent(new Event('click'));

      expect(mockDropboxService.listEntries).toHaveBeenCalledWith('/Documents');
    });

    it('should update breadcrumb navigation', () => {
      (settingsUI as any).currentPath = '/Documents/Projects';
      (settingsUI as any).updateBreadcrumb();

      const breadcrumbPath = document.getElementById('breadcrumbPath');
      expect(breadcrumbPath?.innerHTML).toContain('Documents');
      expect(breadcrumbPath?.innerHTML).toContain('Projects');
    });

    it('should handle breadcrumb navigation clicks', async () => {
      mockDropboxService.listEntries.mockResolvedValue([]);
      
      const breadcrumbItem = document.createElement('span');
      breadcrumbItem.classList.add('breadcrumb-item', 'clickable');
      breadcrumbItem.setAttribute('data-path', '/Documents');
      document.body.appendChild(breadcrumbItem);

      breadcrumbItem.click();

      expect(mockDropboxService.listEntries).toHaveBeenCalledWith('/Documents');
    });

    it('should update new file path display', () => {
      (settingsUI as any).currentPath = '/Documents';
      (settingsUI as any).updateNewFilePath();

      const newFilePathInput = document.getElementById('newFilePath') as HTMLInputElement;
      expect(newFilePathInput.value).toBe('/Documents');
    });
  });

  describe('file operations', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(true);
      mockDropboxService.listEntries.mockResolvedValue([]);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should create new file with .md extension', async () => {
      const mockFile = {
        id: 'new-file',
        name: 'test-notes.md',
        path: '/test-notes.md',
        rev: 'rev1',
      };

      mockDropboxService.createFile.mockResolvedValue(mockFile);
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        notes: 'Current notes content',
      });
      (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);

      // Mock alert
      (globalThis as any).alert = jest.fn();

      const fileNameInput = document.getElementById('newFileName') as HTMLInputElement;
      const createButton = document.getElementById('createFile');

      fileNameInput.value = 'test-notes';
      createButton?.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockDropboxService.createFile).toHaveBeenCalledWith(
        '/test-notes.md',
        'Current notes content'
      );
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        dropboxFilePath: '/test-notes.md',
      });
      expect(globalThis.alert).toHaveBeenCalledWith('File "test-notes.md" created successfully!');
    });

    it('should create file in current folder', async () => {
      (settingsUI as any).currentPath = '/Documents';
      
      const mockFile = {
        id: 'new-file',
        name: 'notes.md',
        path: '/Documents/notes.md',
        rev: 'rev1',
      };

      mockDropboxService.createFile.mockResolvedValue(mockFile);
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        notes: 'Content',
      });

      const fileNameInput = document.getElementById('newFileName') as HTMLInputElement;
      const createButton = document.getElementById('createFile');

      fileNameInput.value = 'notes';
      createButton?.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockDropboxService.createFile).toHaveBeenCalledWith(
        '/Documents/notes.md',
        'Content'
      );
    });

    it('should handle file creation error', async () => {
      mockDropboxService.createFile.mockRejectedValue(new Error('Creation failed'));
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        notes: 'Content',
      });

      (globalThis as any).alert = jest.fn();

      const fileNameInput = document.getElementById('newFileName') as HTMLInputElement;
      const createButton = document.getElementById('createFile');

      fileNameInput.value = 'test';
      createButton?.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(globalThis.alert).toHaveBeenCalledWith('Failed to create file. Please try again.');
    });

    it('should require file name for creation', () => {
      (globalThis as any).alert = jest.fn();

      const createButton = document.getElementById('createFile');
      createButton?.click();

      expect(globalThis.alert).toHaveBeenCalledWith('Please enter a file name');
      expect(mockDropboxService.createFile).not.toHaveBeenCalled();
    });

    it('should refresh file list', async () => {
      mockDropboxService.listEntries.mockResolvedValue([]);

      const refreshButton = document.getElementById('refreshFiles');
      refreshButton?.click();

      expect(mockDropboxService.listEntries).toHaveBeenCalled();
    });
  });

  describe('file selection and sync', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(true);
      mockDropboxService.listEntries.mockResolvedValue([]);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should select file and trigger sync', async () => {
      const filesSelect = document.getElementById('dropboxFiles') as HTMLSelectElement;
      const currentFileDiv = document.getElementById('currentFile');
      const currentFilePathSpan = document.getElementById('currentFilePath');

      // Add option to select
      const option = document.createElement('option');
      option.value = '/notes.md';
      option.textContent = 'notes.md';
      filesSelect.appendChild(option);

      filesSelect.value = '/notes.md';
      filesSelect.dispatchEvent(new Event('change'));

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        dropboxFilePath: '/notes.md',
      });
      expect(currentFileDiv?.style.display).toBe('block');
      expect(currentFilePathSpan?.textContent).toBe('/notes.md');
    });

    it('should load current file info', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        dropboxFilePath: '/current-notes.md',
        lastSyncTime: 1234567890000,
      });

      await (settingsUI as any).loadCurrentFile();

      const currentFileDiv = document.getElementById('currentFile');
      const currentFilePathSpan = document.getElementById('currentFilePath');
      const lastSyncSpan = document.getElementById('lastSyncTime');

      expect(currentFileDiv?.style.display).toBe('block');
      expect(currentFilePathSpan?.textContent).toBe('/current-notes.md');
      expect(lastSyncSpan?.textContent).toContain('2009'); // Date check
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
      mockDropboxService.isAuthenticated.mockReturnValue(true);

      settingsUI = new SettingsUI();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    it('should handle folder loading errors', async () => {
      mockDropboxService.listEntries.mockRejectedValue(new Error('Loading failed'));

      await (settingsUI as any).loadFolderContent('/');

      const folderList = document.getElementById('folderList');
      const filesSelect = document.getElementById('dropboxFiles') as HTMLSelectElement;

      expect(folderList?.textContent).toContain('Failed to load content');
      expect(Array.from(filesSelect.options).some(opt => 
        opt.textContent === 'Failed to load files - check console'
      )).toBe(true);
    });

    it('should show empty folder message', async () => {
      mockDropboxService.listEntries.mockResolvedValue([]);

      await (settingsUI as any).loadFolderContent('/');

      const folderList = document.getElementById('folderList');
      expect(folderList?.textContent).toContain('This folder is empty');
    });
  });
});