import { describe, it, expect, beforeEach } from 'vitest';
import { VimMode } from '../VimMode';

describe('VimMode', () => {
  let vimMode: VimMode;
  let mockTextarea: HTMLTextAreaElement;
  let mockIndicator: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <textarea id="notepad">Test content</textarea>
      <span id="vimMode"></span>
    `;

    mockTextarea = document.getElementById('notepad') as HTMLTextAreaElement;
    mockIndicator = document.getElementById('vimMode') as HTMLElement;

    vimMode = new VimMode(mockTextarea, mockIndicator);
  });

  describe('mode management', () => {
    it('should start in normal mode when enabled', () => {
      vimMode.enable();

      expect(vimMode.mode).toBe('normal');
      expect(vimMode.enabled).toBe(true);
      expect(mockIndicator.textContent).toBe('NORMAL');
      expect(mockIndicator.classList.contains('normal-mode')).toBe(true);
    });

    it('should properly disable vim mode', () => {
      vimMode.enable();
      vimMode.disable();

      expect(vimMode.enabled).toBe(false);
      expect(mockIndicator.classList.contains('active')).toBe(false);
    });

    it('should switch to insert mode on "i" key', () => {
      vimMode.enable();

      const event = new KeyboardEvent('keydown', { key: 'i' });
      mockTextarea.dispatchEvent(event);

      expect(vimMode.mode).toBe('insert');
      expect(mockIndicator.textContent).toBe('INSERT');
      expect(mockIndicator.classList.contains('insert-mode')).toBe(true);
    });

    it('should return to normal mode on Escape in insert mode', () => {
      vimMode.enable();
      vimMode.enterInsertMode();

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      mockTextarea.dispatchEvent(event);

      expect(vimMode.mode).toBe('normal');
      expect(mockIndicator.textContent).toBe('NORMAL');
    });

    it('should enter visual mode on "v" key', () => {
      vimMode.enable();

      const event = new KeyboardEvent('keydown', { key: 'v' });
      mockTextarea.dispatchEvent(event);

      expect(vimMode.mode).toBe('visual');
      expect(mockIndicator.textContent).toBe('VISUAL');
      expect(mockIndicator.classList.contains('visual-mode')).toBe(true);
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      vimMode.enable();
      mockTextarea.value = 'Line 1\nLine 2\nLine 3';
      mockTextarea.setSelectionRange(0, 0);
    });

    it('should move cursor left on "h" key', () => {
      mockTextarea.setSelectionRange(5, 5);

      const event = new KeyboardEvent('keydown', { key: 'h' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.selectionStart).toBe(4);
      expect(mockTextarea.selectionEnd).toBe(4);
    });

    it('should move cursor right on "l" key', () => {
      mockTextarea.setSelectionRange(5, 5);

      const event = new KeyboardEvent('keydown', { key: 'l' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.selectionStart).toBe(6);
      expect(mockTextarea.selectionEnd).toBe(6);
    });

    it('should move to line start on "0" key', () => {
      mockTextarea.setSelectionRange(10, 10);

      const event = new KeyboardEvent('keydown', { key: '0' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.selectionStart).toBe(7);
    });

    it('should move to line end on "$" key', () => {
      mockTextarea.setSelectionRange(7, 7);

      const event = new KeyboardEvent('keydown', { key: '$' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.selectionStart).toBe(13);
    });

    it('should move to document start on "gg"', () => {
      mockTextarea.setSelectionRange(10, 10);

      const event1 = new KeyboardEvent('keydown', { key: 'g' });
      vimMode.handleKeydown(event1);

      const event2 = new KeyboardEvent('keydown', { key: 'g' });
      vimMode.handleKeydown(event2);

      expect(mockTextarea.selectionStart).toBe(0);
      expect(mockTextarea.selectionEnd).toBe(0);
    });

    it('should move to document end on "G"', () => {
      mockTextarea.setSelectionRange(0, 0);

      const event = new KeyboardEvent('keydown', { key: 'G' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.selectionStart).toBe(mockTextarea.value.length);
      expect(mockTextarea.selectionEnd).toBe(mockTextarea.value.length);
    });
  });

  describe('editing operations', () => {
    beforeEach(() => {
      vimMode.enable();
      mockTextarea.value = 'Test content';
      mockTextarea.setSelectionRange(0, 0);
    });

    it('should delete character on "x" key', () => {
      const originalLength = mockTextarea.value.length;

      const event = new KeyboardEvent('keydown', { key: 'x' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.value).toBe('est content');
      expect(mockTextarea.value.length).toBe(originalLength - 1);
    });

    it('should delete line on "dd"', () => {
      mockTextarea.value = 'Line 1\nLine 2\nLine 3';
      mockTextarea.setSelectionRange(0, 0);

      const event1 = new KeyboardEvent('keydown', { key: 'd' });
      vimMode.handleKeydown(event1);

      const event2 = new KeyboardEvent('keydown', { key: 'd' });
      vimMode.handleKeydown(event2);

      expect(mockTextarea.value).toBe('Line 2\nLine 3');
    });

    it('should yank line on "yy"', () => {
      mockTextarea.value = 'Line 1\nLine 2';
      mockTextarea.setSelectionRange(0, 0);

      const event1 = new KeyboardEvent('keydown', { key: 'y' });
      vimMode.handleKeydown(event1);

      const event2 = new KeyboardEvent('keydown', { key: 'y' });
      vimMode.handleKeydown(event2);

      expect(vimMode.yankedText).toBe('Line 1\n');
    });

    it('should paste yanked text on "p"', () => {
      vimMode.yankedText = 'pasted text';
      mockTextarea.setSelectionRange(0, 0);

      const event = new KeyboardEvent('keydown', { key: 'p' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.value).toContain('pasted text');
    });
  });

  describe('visual mode', () => {
    beforeEach(() => {
      vimMode.enable();
      mockTextarea.value = 'Test content for visual mode';
      mockTextarea.setSelectionRange(0, 0);
    });

    it('should enter visual mode and allow selection', () => {
      const vEvent = new KeyboardEvent('keydown', { key: 'v' });
      vimMode.handleKeydown(vEvent);

      expect(vimMode.mode).toBe('visual');

      const lEvent = new KeyboardEvent('keydown', { key: 'l' });
      vimMode.handleKeydown(lEvent);
      vimMode.handleKeydown(lEvent);
      vimMode.handleKeydown(lEvent);

      expect(mockTextarea.selectionEnd).toBe(3);
    });

    it('should yank selection in visual mode', () => {
      mockTextarea.setSelectionRange(0, 4);
      vimMode.mode = 'visual';

      const event = new KeyboardEvent('keydown', { key: 'y' });
      vimMode.handleKeydown(event);

      expect(vimMode.yankedText).toBe('Test');
      expect(vimMode.mode).toBe('normal');
    });

    it('should delete selection in visual mode', () => {
      mockTextarea.setSelectionRange(0, 5);
      vimMode.mode = 'visual';

      const event = new KeyboardEvent('keydown', { key: 'd' });
      vimMode.handleKeydown(event);

      expect(mockTextarea.value).toBe('content for visual mode');
      expect(vimMode.mode).toBe('normal');
    });
  });
});
