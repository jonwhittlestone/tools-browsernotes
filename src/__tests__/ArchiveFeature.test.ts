import { NotesAppWithDropbox } from '../NotesAppWithDropbox';

describe('Archive Feature', () => {
  let app: any;
  let mockDropboxService: any;

  beforeEach(() => {
    // Setup DOM elements
    document.body.innerHTML = `
      <textarea id="notepad"></textarea>
      <span id="saveStatus"></span>
      <span id="vimMode"></span>
      <button id="dateTemplateBtn"></button>
      <span id="taskCount"></span>
      <span id="inboxCount"></span>
      <span id="workInboxCount"></span>
      <span id="workJiraDoneCount"></span>
      <span id="pocketMoney"></span>
    `;

    // Create a minimal app instance with just the methods we need
    app = {
      dropboxSyncEnabled: true,
      currentFilePath: '/test/notes.md',
      dropboxService: null,
      
      // Copy the methods we want to test from the prototype
      getTodaysDateContext: NotesAppWithDropbox.prototype.getTodaysDateContext,
      findDateContextForTask: NotesAppWithDropbox.prototype.findDateContextForTask,
      parseDateFromHeader: NotesAppWithDropbox.prototype.parseDateFromHeader,
      parseArchiveIntoSections: NotesAppWithDropbox.prototype.parseArchiveIntoSections,
      rebuildArchiveFromSections: NotesAppWithDropbox.prototype.rebuildArchiveFromSections,
      removeTimestampFromArchive: NotesAppWithDropbox.prototype.removeTimestampFromArchive,
      generateTimestampHeader: NotesAppWithDropbox.prototype.generateTimestampHeader,
      insertTaskIntoArchive: NotesAppWithDropbox.prototype.insertTaskIntoArchive,
      getArchiveFileName: NotesAppWithDropbox.prototype.getArchiveFileName,
      getArchiveFilePath: NotesAppWithDropbox.prototype.getArchiveFilePath,
      archiveDeletedTask: NotesAppWithDropbox.prototype.archiveDeletedTask,
      addToArchive: NotesAppWithDropbox.prototype.addToArchive
    };

    // Setup dropbox service mock
    mockDropboxService = {
      readFile: jest.fn(),
      createFile: jest.fn(),
      updateFile: jest.fn()
    };
    app.dropboxService = mockDropboxService;
  });

  describe('getTodaysDateContext', () => {
    it('should generate correct date format', () => {
      const result = app.getTodaysDateContext();
      
      // Should match format: YYYY-MM-DD-WXX-Day
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-W\d{1,2}-\w{3}$/);
    });
  });

  describe('findDateContextForTask', () => {
    it('should find date context from preceding header', () => {
      const content = `## 2025-09-05-W36-Fri
- Task A
- Task B

## 2025-09-04-W36-Thu
- Task C
- Task D`;

      // Cursor position at "Task B" (around position 50)
      const cursorPosition = 50;
      
      const result = app.findDateContextForTask(content, cursorPosition);
      
      expect(result).toBe('2025-09-05-W36-Fri');
    });

    it('should find date context from earlier header', () => {
      const content = `## 2025-09-05-W36-Fri
- Task A

## 2025-09-04-W36-Thu
- Task C
- Task D`;

      // Cursor position at "Task D" (around position 70)
      const cursorPosition = 70;
      
      const result = app.findDateContextForTask(content, cursorPosition);
      
      expect(result).toBe('2025-09-04-W36-Thu');
    });

    it('should return null when no date header found', () => {
      const content = `Random content
- Task without date
More content`;

      const cursorPosition = 30;
      
      const result = app.findDateContextForTask(content, cursorPosition);
      
      expect(result).toBeNull();
    });
  });

  describe('parseDateFromHeader', () => {
    it('should parse valid date headers correctly', () => {
      const testCases = [
        { header: '## 2025-09-05-W36-Fri', expected: new Date(2025, 8, 5) },
        { header: '## 2025-01-15-W3-Wed', expected: new Date(2025, 0, 15) },
        { header: '## 2024-12-31-W53-Tue', expected: new Date(2024, 11, 31) }
      ];

      testCases.forEach(({ header, expected }) => {
        const result = app.parseDateFromHeader(header);
        expect(result).toEqual(expected);
      });
    });

    it('should return null for invalid headers', () => {
      const invalidHeaders = [
        '# 2025-09-05-W36-Fri',  // Wrong heading level
        '## Invalid header',
        'Not a header at all'
      ];

      invalidHeaders.forEach(header => {
        const result = app.parseDateFromHeader(header);
        expect(result).toBeNull();
      });
    });
  });

  describe('parseArchiveIntoSections', () => {
    it('should parse empty archive correctly', () => {
      const result = app.parseArchiveIntoSections('');
      expect(result).toEqual([]);
    });

    it('should parse archive with single section', () => {
      const archive = `## 2025-09-05-W36-Fri
- [x] Task A
- [x] Task B`;

      const result = app.parseArchiveIntoSections(archive);
      
      expect(result).toHaveLength(1);
      expect(result[0].header).toBe('## 2025-09-05-W36-Fri');
      expect(result[0].tasks).toEqual(['- [x] Task A', '- [x] Task B']);
      expect(result[0].date).toEqual(new Date(2025, 8, 5));
    });

    it('should parse archive with multiple sections', () => {
      const archive = `## 2025-09-05-W36-Fri
- [x] Task A

## 2025-09-04-W36-Thu
- [x] Task B
- [x] Task C`;

      const result = app.parseArchiveIntoSections(archive);
      
      expect(result).toHaveLength(2);
      expect(result[0].header).toBe('## 2025-09-05-W36-Fri');
      expect(result[0].tasks).toEqual(['- [x] Task A']);
      expect(result[1].header).toBe('## 2025-09-04-W36-Thu');
      expect(result[1].tasks).toEqual(['- [x] Task B', '- [x] Task C']);
    });

    it('should ignore non-task lines', () => {
      const archive = `## 2025-09-05-W36-Fri
- [x] Valid task
Random text
- Not completed task
- [x] Another valid task`;

      const result = app.parseArchiveIntoSections(archive);
      
      expect(result).toHaveLength(1);
      expect(result[0].tasks).toEqual(['- [x] Valid task', '- [x] Another valid task']);
    });
  });

  describe('rebuildArchiveFromSections', () => {
    it('should rebuild archive correctly', () => {
      const sections = [
        {
          header: '## 2025-09-05-W36-Fri',
          date: new Date(2025, 8, 5),
          tasks: ['- [x] Task A', '- [x] Task B']
        },
        {
          header: '## 2025-09-04-W36-Thu',
          date: new Date(2025, 8, 4),
          tasks: ['- [x] Task C']
        }
      ];

      const result = app.rebuildArchiveFromSections(sections);
      
      const expected = `## 2025-09-05-W36-Fri
- [x] Task A
- [x] Task B

## 2025-09-04-W36-Thu
- [x] Task C`;

      expect(result).toBe(expected);
    });

    it('should handle single section without trailing newline', () => {
      const sections = [
        {
          header: '## 2025-09-05-W36-Fri',
          date: new Date(2025, 8, 5),
          tasks: ['- [x] Task A']
        }
      ];

      const result = app.rebuildArchiveFromSections(sections);
      
      expect(result).toBe(`## 2025-09-05-W36-Fri
- [x] Task A`);
    });
  });

  describe('removeTimestampFromArchive', () => {
    it('should remove timestamp header from archive', () => {
      const archiveWithTimestamp = `Last updated: Thursday, September 5, 2024 at 02:45:30 PM (took 1.23 seconds)

## 2025-09-05-W36-Fri
- [x] Task A`;

      const result = app.removeTimestampFromArchive(archiveWithTimestamp);
      
      expect(result).toBe(`## 2025-09-05-W36-Fri
- [x] Task A`);
    });

    it('should handle archive without timestamp', () => {
      const archiveWithoutTimestamp = `## 2025-09-05-W36-Fri
- [x] Task A`;

      const result = app.removeTimestampFromArchive(archiveWithoutTimestamp);
      
      expect(result).toBe(archiveWithoutTimestamp);
    });

    it('should handle timestamp without following empty line', () => {
      const archiveWithTimestamp = `Last updated: Thursday, September 5, 2024 at 02:45:30 PM (took 1.23 seconds)
## 2025-09-05-W36-Fri
- [x] Task A`;

      const result = app.removeTimestampFromArchive(archiveWithTimestamp);
      
      expect(result).toBe(`## 2025-09-05-W36-Fri
- [x] Task A`);
    });
  });

  describe('generateTimestampHeader', () => {
    beforeEach(() => {
      // Mock console.log to avoid noise in tests
      jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      (console.log as jest.Mock).mockRestore();
    });

    it('should generate timestamp with milliseconds', () => {
      const result = app.generateTimestampHeader(500);
      
      expect(result).toMatch(/^Last updated: .+ at .+ \(took 500ms\)$/);
    });

    it('should generate timestamp with seconds', () => {
      const result = app.generateTimestampHeader(2500);
      
      expect(result).toMatch(/^Last updated: .+ at .+ \(took 2\.50 seconds\)$/);
    });

    it('should generate timestamp with minutes and seconds', () => {
      const result = app.generateTimestampHeader(125500); // 2 minutes 5.5 seconds
      
      expect(result).toMatch(/^Last updated: .+ at .+ \(took 2 minutes, 5\.50 seconds\)$/);
    });
  });

  describe('insertTaskIntoArchive', () => {
    beforeEach(() => {
      // Mock console.log for timestamp generation
      jest.spyOn(console, 'log').mockImplementation();
      // Mock Date.now for consistent timing
      jest.spyOn(Date, 'now').mockReturnValue(1000);
    });

    afterEach(() => {
      (console.log as jest.Mock).mockRestore();
      (Date.now as jest.Mock).mockRestore();
    });

    it('should create new archive with timestamp', () => {
      const result = app.insertTaskIntoArchive('', '2025-09-05-W36-Fri', '- [x] New task', 500);
      
      expect(result).toMatch(/^Last updated: .+/);
      expect(result).toContain('## 2025-09-05-W36-Fri');
      expect(result).toContain('- [x] New task');
    });

    it('should add task to existing date section', () => {
      const existingArchive = `## 2025-09-05-W36-Fri
- [x] Existing task`;

      const result = app.insertTaskIntoArchive(existingArchive, '2025-09-05-W36-Fri', '- [x] New task', 500);
      
      expect(result).toContain('- [x] Existing task');
      expect(result).toContain('- [x] New task');
    });

    it('should sort sections by date (most recent first)', () => {
      const existingArchive = `## 2025-09-01-W34-Mon
- [x] Old task

## 2025-09-05-W36-Fri
- [x] Recent task`;

      const result = app.insertTaskIntoArchive(existingArchive, '2025-09-03-W36-Wed', '- [x] Middle task', 500);
      
      // Should be sorted: Sep 5, Sep 3, Sep 1
      const lines = result.split('\n');
      const fridayIndex = lines.findIndex((line: string) => line.includes('2025-09-05-W36-Fri'));
      const wednesdayIndex = lines.findIndex((line: string) => line.includes('2025-09-03-W36-Wed'));
      const mondayIndex = lines.findIndex((line: string) => line.includes('2025-09-01-W34-Mon'));
      
      expect(fridayIndex).toBeLessThan(wednesdayIndex);
      expect(wednesdayIndex).toBeLessThan(mondayIndex);
    });
  });

  describe('getArchiveFileName', () => {
    it('should add archive suffix to filename', () => {
      const result = app.getArchiveFileName('notes.md');
      expect(result).toBe('notes.archive.md');
    });

    it('should handle filename without extension', () => {
      const result = app.getArchiveFileName('notes');
      expect(result).toBe('notes.archive');
    });

    it('should handle multiple dots in filename', () => {
      const result = app.getArchiveFileName('my.notes.file.md');
      expect(result).toBe('my.notes.file.archive.md');
    });
  });

  describe('getArchiveFilePath', () => {
    it('should add archive suffix to file path', () => {
      const result = app.getArchiveFilePath('/path/to/notes.md');
      expect(result).toBe('/path/to/notes.archive.md');
    });

    it('should handle path without extension', () => {
      const result = app.getArchiveFilePath('/path/to/notes');
      expect(result).toBe('/path/to/notes.archive');
    });
  });

  describe('archiveDeletedTask', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation();
    });

    afterEach(() => {
      (console.log as jest.Mock).mockRestore();
    });

    it('should skip non-task lines', async () => {
      const addToArchiveSpy = jest.spyOn(app, 'addToArchive').mockResolvedValue(undefined);

      await app.archiveDeletedTask('Random text\n', 'content', 0);
      await app.archiveDeletedTask('- \n', 'content', 0); // Empty task

      expect(addToArchiveSpy).not.toHaveBeenCalled();
    });

    it('should archive valid task with date context', async () => {
      const addToArchiveSpy = jest.spyOn(app, 'addToArchive').mockResolvedValue(undefined);
      const content = `## 2025-09-05-W36-Fri
- Valid task`;

      await app.archiveDeletedTask('- Valid task\n', content, 30);

      expect(addToArchiveSpy).toHaveBeenCalledWith('2025-09-05-W36-Fri', '- [x] Valid task');
    });

    it('should use today\'s date when no context found', async () => {
      const addToArchiveSpy = jest.spyOn(app, 'addToArchive').mockResolvedValue(undefined);
      const getTodaysDateContextSpy = jest.spyOn(app, 'getTodaysDateContext').mockReturnValue('2024-09-05-W36-Thu');
      
      const content = `Random content
- Valid task without context`;

      await app.archiveDeletedTask('- Valid task without context\n', content, 30);

      expect(getTodaysDateContextSpy).toHaveBeenCalled();
      expect(addToArchiveSpy).toHaveBeenCalledWith('2024-09-05-W36-Thu', '- [x] Valid task without context');
    });
  });

  describe('addToArchive', () => {
    beforeEach(() => {
      jest.spyOn(console, 'log').mockImplementation();
      jest.spyOn(Date, 'now').mockReturnValue(1000);
    });

    afterEach(() => {
      (console.log as jest.Mock).mockRestore();
      (Date.now as jest.Mock).mockRestore();
    });

    it('should create new archive file', async () => {
      mockDropboxService.readFile.mockRejectedValue(new Error('File not found'));
      mockDropboxService.createFile.mockResolvedValue(undefined);

      await app.addToArchive('2025-09-05-W36-Fri', '- [x] New task');

      expect(mockDropboxService.createFile).toHaveBeenCalledWith(
        '/test/notes.archive.md',
        expect.stringMatching(/^Last updated: .+/)
      );
      expect(mockDropboxService.createFile).toHaveBeenCalledWith(
        '/test/notes.archive.md',
        expect.stringContaining('## 2025-09-05-W36-Fri')
      );
      expect(mockDropboxService.createFile).toHaveBeenCalledWith(
        '/test/notes.archive.md',
        expect.stringContaining('- [x] New task')
      );
    });

    it('should update existing archive file', async () => {
      const existingArchive = `## 2025-09-04-W36-Thu
- [x] Old task`;
      
      mockDropboxService.readFile.mockResolvedValue(existingArchive);
      mockDropboxService.updateFile.mockResolvedValue(undefined);

      await app.addToArchive('2025-09-05-W36-Fri', '- [x] New task');

      expect(mockDropboxService.updateFile).toHaveBeenCalledWith(
        '/test/notes.archive.md',
        expect.stringContaining('- [x] New task')
      );
    });

    it('should skip when dropbox is not enabled', async () => {
      app.dropboxSyncEnabled = false;

      await app.addToArchive('2025-09-05-W36-Fri', '- [x] New task');

      expect(mockDropboxService.readFile).not.toHaveBeenCalled();
      expect(mockDropboxService.createFile).not.toHaveBeenCalled();
      expect(mockDropboxService.updateFile).not.toHaveBeenCalled();
    });

    it('should skip when no current file path', async () => {
      app.currentFilePath = null;

      await app.addToArchive('2025-09-05-W36-Fri', '- [x] New task');

      expect(mockDropboxService.readFile).not.toHaveBeenCalled();
      expect(mockDropboxService.createFile).not.toHaveBeenCalled();
      expect(mockDropboxService.updateFile).not.toHaveBeenCalled();
    });
  });
});