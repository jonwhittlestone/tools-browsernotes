import { describe, it, expect } from 'vitest';
import {
  getArchiveFilePath,
  insertTaskIntoArchive,
  parseArchiveIntoSections,
  rebuildArchiveFromSections,
} from '../ArchiveHelper';

describe('getArchiveFilePath', () => {
  it('inserts .archive before extension', () => {
    expect(getArchiveFilePath('/notes.md')).toBe('/notes.archive.md');
  });

  it('handles nested paths', () => {
    expect(getArchiveFilePath('/folder/tools-browsernotes.md')).toBe(
      '/folder/tools-browsernotes.archive.md',
    );
  });

  it('appends .archive when no extension', () => {
    expect(getArchiveFilePath('/notes')).toBe('/notes.archive');
  });
});

describe('insertTaskIntoArchive', () => {
  it('inserts a task into empty archive', () => {
    const result = insertTaskIntoArchive('', '2026-02-09-W6-Sun', '- [x] Buy milk');
    expect(result).toContain('Last updated:');
    expect(result).toContain('## 2026-02-09-W6-Sun');
    expect(result).toContain('- [x] Buy milk');
  });

  it('adds task to existing date section', () => {
    const existing = 'Last updated: old\n\n## 2026-02-09-W6-Sun\n- [x] Walk dog';
    const result = insertTaskIntoArchive(existing, '2026-02-09-W6-Sun', '- [x] Buy milk');
    expect(result).toContain('- [x] Walk dog');
    expect(result).toContain('- [x] Buy milk');
  });

  it('creates new date section when needed', () => {
    const existing = 'Last updated: old\n\n## 2026-02-08-W6-Sat\n- [x] Old task';
    const result = insertTaskIntoArchive(existing, '2026-02-09-W6-Sun', '- [x] New task');
    expect(result).toContain('## 2026-02-09-W6-Sun');
    expect(result).toContain('## 2026-02-08-W6-Sat');
    // Most recent first
    expect(result.indexOf('2026-02-09')).toBeLessThan(result.indexOf('2026-02-08'));
  });

  it('includes adornment lines with task', () => {
    const taskWithAdornments = '- [x] Meeting with Bob\n  - Discuss budget\n  - Review timeline';
    const result = insertTaskIntoArchive('', '2026-02-09-W6-Sun', taskWithAdornments);
    expect(result).toContain('- [x] Meeting with Bob');
    expect(result).toContain('  - Discuss budget');
    expect(result).toContain('  - Review timeline');
  });
});

describe('parseArchiveIntoSections', () => {
  it('parses sections with adornment lines', () => {
    const content = [
      '## 2026-02-09-W6-Sun',
      '- [x] Task with details',
      '  - Detail 1',
      '  - Detail 2',
      '- [x] Simple task',
    ].join('\n');
    const sections = parseArchiveIntoSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].tasks).toHaveLength(2);
    expect(sections[0].tasks[0]).toBe(
      '- [x] Task with details\n  - Detail 1\n  - Detail 2',
    );
    expect(sections[0].tasks[1]).toBe('- [x] Simple task');
  });

  it('round-trips tasks with adornments', () => {
    const content = [
      '## 2026-02-09-W6-Sun',
      '- [x] Task A',
      '  - Sub A',
      '- [x] Task B',
    ].join('\n');
    const sections = parseArchiveIntoSections(content);
    const rebuilt = rebuildArchiveFromSections(sections);
    expect(rebuilt).toBe(content);
  });
});
