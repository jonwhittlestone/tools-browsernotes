import Sortable from 'sortablejs';
import {
  ParsedSection,
  ParsedLine,
  parseMarkdown,
  serializeMarkdown,
  toggleTaskCompletion,
  createTaskLine,
  updateTaskText,
} from './MarkdownParser';
import { EmojiPicker } from './EmojiPicker';

export interface TaskViewOptions {
  container: HTMLElement;
  onContentChange: (markdown: string) => void;
}

/**
 * Mobile-optimized task view that renders markdown sections as
 * interactive card lists with checkboxes, inline editing, and
 * a floating action button for adding tasks.
 */
export class TaskView {
  private container: HTMLElement;
  private onContentChange: (markdown: string) => void;
  private sections: ParsedSection[] = [];
  private editingElement: HTMLElement | null = null;
  private sortables: Sortable[] = [];

  constructor(options: TaskViewOptions) {
    this.container = options.container;
    this.onContentChange = options.onContentChange;
  }

  /**
   * Render the task view from markdown content.
   */
  render(content: string): void {
    // Destroy existing sortable instances
    for (const s of this.sortables) {
      s.destroy();
    }
    this.sortables = [];

    this.sections = parseMarkdown(content);
    this.container.innerHTML = '';

    for (let si = 0; si < this.sections.length; si++) {
      const section = this.sections[si];
      const sectionEl = this.createSectionElement(section, si);
      this.container.appendChild(sectionEl);
    }

    // Initialize SortableJS on each task list
    this.initSortable();

    // Floating action button
    const fab = document.createElement('button');
    fab.className = 'task-fab';
    fab.textContent = '+';
    fab.title = 'Add task';
    fab.addEventListener('click', () => this.addTask());
    this.container.appendChild(fab);
  }

  private initSortable(): void {
    const lists = this.container.querySelectorAll('.task-list');
    lists.forEach((listEl) => {
      const sectionIndex = parseInt(
        (listEl as HTMLElement).dataset.sectionIndex || '0',
      );
      const sortable = Sortable.create(listEl as HTMLElement, {
        handle: '.task-drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        filter: '.task-text-line',
        onEnd: (evt) => {
          if (
            evt.oldIndex !== undefined &&
            evt.newIndex !== undefined &&
            evt.oldIndex !== evt.newIndex
          ) {
            this.handleReorder(sectionIndex, evt.oldIndex, evt.newIndex);
          }
        },
      });
      this.sortables.push(sortable);
    });
  }

  private createSectionElement(
    section: ParsedSection,
    sectionIndex: number,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'task-section';
    el.dataset.sectionIndex = String(sectionIndex);

    if (section.header) {
      const headerEl = document.createElement('div');
      headerEl.className = 'task-section-header';
      headerEl.textContent = section.header.text;
      el.appendChild(headerEl);
    }

    const listEl = document.createElement('div');
    listEl.className = 'task-list';
    listEl.dataset.sectionIndex = String(sectionIndex);

    for (let li = 0; li < section.lines.length; li++) {
      const line = section.lines[li];
      if (line.type === 'task' || line.type === 'completed-task') {
        const taskEl = this.createTaskElement(line, sectionIndex, li);
        listEl.appendChild(taskEl);
      } else if (line.type === 'text' && line.raw.trim() !== '') {
        const textEl = document.createElement('div');
        textEl.className = 'task-text-line';
        textEl.textContent = line.raw;
        listEl.appendChild(textEl);
      }
      // Skip empty lines and separators in task view (they're preserved in the data)
    }

    el.appendChild(listEl);
    return el;
  }

  private createTaskElement(
    line: ParsedLine,
    sectionIndex: number,
    lineIndex: number,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = `task-item${line.type === 'completed-task' ? ' completed' : ''}`;
    el.dataset.sectionIndex = String(sectionIndex);
    el.dataset.lineIndex = String(lineIndex);

    // Checkbox
    const checkbox = document.createElement('div');
    checkbox.className = 'task-checkbox';
    checkbox.innerHTML = line.type === 'completed-task' ? '&#x2713;' : '';
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleTask(sectionIndex, lineIndex);
    });

    // Emoji button
    const emojiBtn = document.createElement('button');
    emojiBtn.className = 'task-emoji-btn';
    const leadingEmoji = this.getLeadingEmoji(line.text);
    emojiBtn.textContent = leadingEmoji || '😀';
    if (!leadingEmoji) emojiBtn.classList.add('placeholder');
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEmojiPicker(sectionIndex, lineIndex, leadingEmoji);
    });

    // Text
    const textEl = document.createElement('div');
    textEl.className = 'task-item-text';
    textEl.textContent = leadingEmoji
      ? line.text.slice(leadingEmoji.length).trimStart()
      : line.text;
    textEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startEditing(textEl, sectionIndex, lineIndex);
    });

    // Drag handle
    const handle = document.createElement('div');
    handle.className = 'task-drag-handle';
    handle.innerHTML = '&#x2630;'; // hamburger icon ☰
    handle.setAttribute('data-drag-handle', 'true');

    el.appendChild(checkbox);
    el.appendChild(emojiBtn);
    el.appendChild(textEl);
    el.appendChild(handle);

    return el;
  }

  private toggleTask(sectionIndex: number, lineIndex: number): void {
    const section = this.sections[sectionIndex];
    if (!section) return;

    const line = section.lines[lineIndex];
    if (!line) return;

    section.lines[lineIndex] = toggleTaskCompletion(line);
    this.emitChange();
    this.render(serializeMarkdown(this.sections));
  }

  private startEditing(
    textEl: HTMLElement,
    sectionIndex: number,
    lineIndex: number,
  ): void {
    if (this.editingElement) return;

    this.editingElement = textEl;
    const line = this.sections[sectionIndex]?.lines[lineIndex];
    if (!line) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'task-edit-input';
    input.value = line.text;

    const finishEdit = () => {
      const newText = input.value.trim();
      if (newText === '') {
        // Delete empty tasks
        this.sections[sectionIndex].lines.splice(lineIndex, 1);
      } else if (newText !== line.text) {
        this.sections[sectionIndex].lines[lineIndex] = updateTaskText(
          line,
          newText,
        );
      }
      this.editingElement = null;
      this.emitChange();
      this.render(serializeMarkdown(this.sections));
    };

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        input.value = line.text; // revert
        input.blur();
      }
    });

    textEl.textContent = '';
    textEl.appendChild(input);
    input.focus();
    input.select();
  }

  private addTask(): void {
    // Add to the first section that has a header, or the first section
    let targetSection = 0;
    for (let i = 0; i < this.sections.length; i++) {
      if (this.sections[i].header) {
        targetSection = i;
        break;
      }
    }

    if (this.sections.length === 0) {
      this.sections.push({ header: null, lines: [] });
      targetSection = 0;
    }

    const newLine = createTaskLine('');
    const section = this.sections[targetSection];

    // Insert after the last task in the section, or at the start
    let insertIndex = 0;
    for (let i = section.lines.length - 1; i >= 0; i--) {
      if (
        section.lines[i].type === 'task' ||
        section.lines[i].type === 'completed-task'
      ) {
        insertIndex = i + 1;
        break;
      }
    }

    section.lines.splice(insertIndex, 0, newLine);
    this.emitChange();
    this.render(serializeMarkdown(this.sections));

    // Focus the new task's input
    const taskItems = this.container.querySelectorAll('.task-item');
    // Find the task item that corresponds to the new item
    for (const item of taskItems) {
      const si = parseInt(item.getAttribute('data-section-index') || '-1');
      const li = parseInt(item.getAttribute('data-line-index') || '-1');
      if (si === targetSection && li === insertIndex) {
        const textEl = item.querySelector('.task-item-text') as HTMLElement;
        if (textEl) {
          this.startEditing(textEl, si, li);
        }
        break;
      }
    }
  }

  /**
   * Handle reorder after SortableJS drag. Updates internal data model.
   */
  private handleReorder(
    sectionIndex: number,
    oldIndex: number,
    newIndex: number,
  ): void {
    const section = this.sections[sectionIndex];
    if (!section) return;

    // Map visual indices to actual line indices (tasks only)
    const taskIndices: number[] = [];
    for (let i = 0; i < section.lines.length; i++) {
      if (
        section.lines[i].type === 'task' ||
        section.lines[i].type === 'completed-task'
      ) {
        taskIndices.push(i);
      }
    }

    if (oldIndex >= taskIndices.length || newIndex >= taskIndices.length) return;

    const actualOld = taskIndices[oldIndex];
    const actualNew = taskIndices[newIndex];

    const [moved] = section.lines.splice(actualOld, 1);
    section.lines.splice(actualNew, 0, moved);

    this.emitChange();
  }

  private getLeadingEmoji(text: string): string | null {
    const match = text.match(
      /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F[\u200D\uFE0F\p{Emoji}]*)/u,
    );
    return match ? match[0] : null;
  }

  private async openEmojiPicker(
    sectionIndex: number,
    lineIndex: number,
    currentEmoji: string | null,
  ): Promise<void> {
    const result = await EmojiPicker.show(currentEmoji || undefined);
    if (result === null) return;

    const line = this.sections[sectionIndex]?.lines[lineIndex];
    if (!line) return;

    const existingEmoji = this.getLeadingEmoji(line.text);
    let newText: string;
    if (existingEmoji) {
      newText = result + ' ' + line.text.slice(existingEmoji.length).trimStart();
    } else {
      newText = result + ' ' + line.text;
    }

    this.sections[sectionIndex].lines[lineIndex] = updateTaskText(
      line,
      newText,
    );
    this.emitChange();
    this.render(serializeMarkdown(this.sections));
  }

  private emitChange(): void {
    this.onContentChange(serializeMarkdown(this.sections));
  }
}
