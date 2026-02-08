import { describe, it, expect } from 'vitest';
import {
  parseLine,
  parseMarkdown,
  serializeMarkdown,
  toggleTaskCompletion,
  createTaskLine,
  updateTaskText,
  ParsedLine,
} from '../MarkdownParser';

describe('parseLine', () => {
  it('parses a header', () => {
    const result = parseLine('## My Header');
    expect(result.type).toBe('header');
    expect(result.text).toBe('My Header');
    expect(result.raw).toBe('## My Header');
  });

  it('parses a task', () => {
    const result = parseLine('- Buy groceries');
    expect(result.type).toBe('task');
    expect(result.text).toBe('Buy groceries');
  });

  it('parses a completed task', () => {
    const result = parseLine('- [x] Buy groceries');
    expect(result.type).toBe('completed-task');
    expect(result.text).toBe('Buy groceries');
  });

  it('parses a separator', () => {
    const result = parseLine('---');
    expect(result.type).toBe('separator');
  });

  it('parses long separators', () => {
    const result = parseLine('-----');
    expect(result.type).toBe('separator');
  });

  it('parses plain text', () => {
    const result = parseLine('Just some text');
    expect(result.type).toBe('text');
    expect(result.text).toBe('Just some text');
  });

  it('parses empty line as text', () => {
    const result = parseLine('');
    expect(result.type).toBe('text');
    expect(result.text).toBe('');
  });

  it('preserves indentation in raw', () => {
    const result = parseLine('  - Indented task');
    expect(result.type).toBe('task');
    expect(result.text).toBe('Indented task');
    expect(result.raw).toBe('  - Indented task');
  });

  it('parses indented completed task', () => {
    const result = parseLine('  - [x] Done');
    expect(result.type).toBe('completed-task');
    expect(result.text).toBe('Done');
  });
});

describe('parseMarkdown', () => {
  it('parses content with no headers into a single section', () => {
    const content = '- Task 1\n- Task 2';
    const sections = parseMarkdown(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].header).toBeNull();
    expect(sections[0].lines).toHaveLength(2);
  });

  it('parses content into sections by headers', () => {
    const content = '## Today\n- Task 1\n- Task 2\n\n## Tomorrow\n- Task 3';
    const sections = parseMarkdown(content);
    expect(sections).toHaveLength(2);
    expect(sections[0].header!.text).toBe('Today');
    expect(sections[0].lines).toHaveLength(3); // Task 1, Task 2, empty line
    expect(sections[1].header!.text).toBe('Tomorrow');
    expect(sections[1].lines).toHaveLength(1); // Task 3
  });

  it('handles content before the first header', () => {
    const content = 'Some intro text\n\n## Section 1\n- Task';
    const sections = parseMarkdown(content);
    expect(sections).toHaveLength(2);
    expect(sections[0].header).toBeNull();
    expect(sections[0].lines).toHaveLength(2); // text + empty line
    expect(sections[1].header!.text).toBe('Section 1');
  });

  it('handles empty content', () => {
    const sections = parseMarkdown('');
    expect(sections).toHaveLength(1);
    expect(sections[0].header).toBeNull();
    expect(sections[0].lines).toHaveLength(1); // single empty line
  });

  it('handles separator between sections', () => {
    const content = '## Today\n- Task 1\n\n---\n\n## Yesterday\n- Task 2';
    const sections = parseMarkdown(content);
    expect(sections).toHaveLength(2);
    // Lines before ## Yesterday: "- Task 1", "", "---", ""
    expect(sections[0].lines).toHaveLength(4);
    expect(sections[0].lines[2].type).toBe('separator');
  });
});

describe('serializeMarkdown', () => {
  it('round-trips content without loss', () => {
    const content =
      '## Today\n- Task 1\n- [x] Task 2\n\n---\n\n## Tomorrow\n- Task 3';
    const sections = parseMarkdown(content);
    const result = serializeMarkdown(sections);
    expect(result).toBe(content);
  });

  it('round-trips content with no headers', () => {
    const content = '- Task 1\n- Task 2\n\nSome text';
    const sections = parseMarkdown(content);
    const result = serializeMarkdown(sections);
    expect(result).toBe(content);
  });

  it('round-trips empty content', () => {
    const content = '';
    const sections = parseMarkdown(content);
    const result = serializeMarkdown(sections);
    expect(result).toBe(content);
  });
});

describe('toggleTaskCompletion', () => {
  it('marks a task as completed', () => {
    const line: ParsedLine = { type: 'task', raw: '- Buy milk', text: 'Buy milk' };
    const toggled = toggleTaskCompletion(line);
    expect(toggled.type).toBe('completed-task');
    expect(toggled.raw).toBe('- [x] Buy milk');
    expect(toggled.text).toBe('Buy milk');
  });

  it('marks a completed task as incomplete', () => {
    const line: ParsedLine = {
      type: 'completed-task',
      raw: '- [x] Buy milk',
      text: 'Buy milk',
    };
    const toggled = toggleTaskCompletion(line);
    expect(toggled.type).toBe('task');
    expect(toggled.raw).toBe('- Buy milk');
  });

  it('preserves indentation when toggling', () => {
    const line: ParsedLine = {
      type: 'task',
      raw: '  - Indented',
      text: 'Indented',
    };
    const toggled = toggleTaskCompletion(line);
    expect(toggled.raw).toBe('  - [x] Indented');
  });

  it('returns non-task lines unchanged', () => {
    const line: ParsedLine = { type: 'text', raw: 'Hello', text: 'Hello' };
    const toggled = toggleTaskCompletion(line);
    expect(toggled).toBe(line);
  });
});

describe('createTaskLine', () => {
  it('creates a task line', () => {
    const line = createTaskLine('New task');
    expect(line.type).toBe('task');
    expect(line.raw).toBe('- New task');
    expect(line.text).toBe('New task');
  });
});

describe('updateTaskText', () => {
  it('updates text of a task', () => {
    const line: ParsedLine = { type: 'task', raw: '- Old text', text: 'Old text' };
    const updated = updateTaskText(line, 'New text');
    expect(updated.type).toBe('task');
    expect(updated.raw).toBe('- New text');
    expect(updated.text).toBe('New text');
  });

  it('updates text of a completed task', () => {
    const line: ParsedLine = {
      type: 'completed-task',
      raw: '- [x] Old text',
      text: 'Old text',
    };
    const updated = updateTaskText(line, 'New text');
    expect(updated.type).toBe('completed-task');
    expect(updated.raw).toBe('- [x] New text');
    expect(updated.text).toBe('New text');
  });

  it('preserves indentation', () => {
    const line: ParsedLine = {
      type: 'task',
      raw: '  - Indented',
      text: 'Indented',
    };
    const updated = updateTaskText(line, 'Updated');
    expect(updated.raw).toBe('  - Updated');
  });
});
