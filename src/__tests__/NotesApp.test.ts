import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { NotesApp } from '../NotesApp';

describe('NotesApp', () => {
  let notesApp: NotesApp;
  let mockTextarea: HTMLTextAreaElement;
  let mockSaveStatus: HTMLElement;
  let mockVimIndicator: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <textarea id="notepad"></textarea>
      <span id="saveStatus"></span>
      <span id="vimMode"></span>
      <button id="dateTemplateBtn"></button>
      <button id="familyPlannerBtn"></button>
      <span id="taskCount"></span>
      <span id="inboxCount"></span>
      <span class="metric"><span id="workInboxCount"></span></span>
      <span class="metric"><span id="workJiraDoneCount"></span></span>
      <span id="pocketMoney"></span>
    `;

    mockTextarea = document.getElementById('notepad') as HTMLTextAreaElement;
    mockSaveStatus = document.getElementById('saveStatus') as HTMLElement;
    mockVimIndicator = document.getElementById('vimMode') as HTMLElement;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('should load saved notes on init', async () => {
      const savedNotes = 'Test notes content';
      (chrome.storage.local.get as Mock).mockResolvedValue({ notes: savedNotes });

      notesApp = new NotesApp();
      await notesApp.init();

      expect(mockTextarea.value).toBe(savedNotes);
    });

    it('should load vim mode settings on init', async () => {
      (chrome.storage.sync.get as Mock).mockResolvedValue({ vimEnabled: true });

      notesApp = new NotesApp();
      await notesApp.init();

      expect(notesApp.vimEnabled).toBe(true);
    });

    it('should handle empty storage gracefully', async () => {
      (chrome.storage.local.get as Mock).mockResolvedValue({});
      (chrome.storage.sync.get as Mock).mockResolvedValue({});

      notesApp = new NotesApp();
      await notesApp.init();

      expect(mockTextarea.value).toBe('');
      expect(notesApp.vimEnabled).toBe(false);
    });
  });

  describe('saving notes', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      notesApp = new NotesApp();
      await notesApp.init();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should save notes after input with debounce', async () => {
      const testText = 'New note content';
      mockTextarea.value = testText;

      const inputEvent = new Event('input', { bubbles: true });
      mockTextarea.dispatchEvent(inputEvent);

      expect(chrome.storage.local.set).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ notes: testText });
    });

    it('should show save status after saving', async () => {
      notesApp.showSaveStatus();

      expect(mockSaveStatus.textContent).toBe('Saved');
      expect(mockSaveStatus.classList.contains('visible')).toBe(true);

      vi.advanceTimersByTime(2000);

      expect(mockSaveStatus.classList.contains('visible')).toBe(false);
    });

    it('should debounce multiple rapid inputs', async () => {
      mockTextarea.value = 'First';
      mockTextarea.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(100);

      mockTextarea.value = 'Second';
      mockTextarea.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(100);

      mockTextarea.value = 'Final';
      mockTextarea.dispatchEvent(new Event('input'));

      expect(chrome.storage.local.set).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);

      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ notes: 'Final' });
    });
  });

  describe('vim mode integration', () => {
    beforeEach(async () => {
      notesApp = new NotesApp();
    });

    it('should enable vim mode when setting is true', async () => {
      (chrome.storage.sync.get as Mock).mockResolvedValue({ vimEnabled: true });

      await notesApp.init();

      expect(notesApp.vimEnabled).toBe(true);
    });

    it('should disable vim mode when setting is false', async () => {
      (chrome.storage.sync.get as Mock).mockResolvedValue({ vimEnabled: false });

      await notesApp.init();

      expect(notesApp.vimEnabled).toBe(false);
    });

    it('should respond to vim mode setting changes', async () => {
      await notesApp.init();

      const changeListener = (chrome.storage.onChanged.addListener as Mock).mock.calls[0][0];

      changeListener(
        { vimEnabled: { newValue: true, oldValue: false } },
        'sync'
      );

      expect(notesApp.vimEnabled).toBe(true);

      changeListener(
        { vimEnabled: { newValue: false, oldValue: true } },
        'sync'
      );

      expect(notesApp.vimEnabled).toBe(false);
    });

  });
});
