export type LineType = 'task' | 'completed-task' | 'header' | 'separator' | 'text';

export interface ParsedLine {
  type: LineType;
  raw: string;
  text: string; // For tasks: the task text without prefix. For others: same as raw.
}

export interface ParsedSection {
  header: ParsedLine | null; // null for content before the first header
  lines: ParsedLine[];
}

/**
 * Parses a markdown string into sections and categorized lines.
 * Sections are delimited by ## headers.
 */
export function parseMarkdown(content: string): ParsedSection[] {
  const rawLines = content.split('\n');
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection = { header: null, lines: [] };

  for (const raw of rawLines) {
    const parsed = parseLine(raw);

    if (parsed.type === 'header') {
      // Push previous section if it has content
      if (currentSection.header !== null || currentSection.lines.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { header: parsed, lines: [] };
    } else {
      currentSection.lines.push(parsed);
    }
  }

  // Push the last section
  if (currentSection.header !== null || currentSection.lines.length > 0) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Serializes parsed sections back to a markdown string.
 */
export function serializeMarkdown(sections: ParsedSection[]): string {
  const lines: string[] = [];

  for (const section of sections) {
    if (section.header) {
      lines.push(section.header.raw);
    }
    for (const line of section.lines) {
      lines.push(line.raw);
    }
  }

  return lines.join('\n');
}

/**
 * Categorizes a single line of markdown.
 */
export function parseLine(raw: string): ParsedLine {
  const trimmed = raw.trimStart();

  // Header: starts with ##
  if (trimmed.startsWith('## ')) {
    return { type: 'header', raw, text: trimmed.slice(3) };
  }

  // Completed task: starts with - [x]
  if (trimmed.startsWith('- [x] ')) {
    return { type: 'completed-task', raw, text: trimmed.slice(6) };
  }

  // Task: starts with - (but not ---)
  if (trimmed.startsWith('- ') && !trimmed.match(/^-{3,}$/)) {
    return { type: 'task', raw, text: trimmed.slice(2) };
  }

  // Separator: ---
  if (trimmed.match(/^-{3,}$/)) {
    return { type: 'separator', raw, text: raw };
  }

  // Everything else is plain text
  return { type: 'text', raw, text: raw };
}

/**
 * Toggles a task's completion status, returning the new raw line.
 */
export function toggleTaskCompletion(line: ParsedLine): ParsedLine {
  if (line.type === 'task') {
    const indent = line.raw.match(/^(\s*)/)?.[1] || '';
    const newRaw = `${indent}- [x] ${line.text}`;
    return { type: 'completed-task', raw: newRaw, text: line.text };
  }
  if (line.type === 'completed-task') {
    const indent = line.raw.match(/^(\s*)/)?.[1] || '';
    const newRaw = `${indent}- ${line.text}`;
    return { type: 'task', raw: newRaw, text: line.text };
  }
  return line;
}

/**
 * Creates a new task line.
 */
export function createTaskLine(text: string): ParsedLine {
  return { type: 'task', raw: `- ${text}`, text };
}

/**
 * Updates the text of a task line, preserving its type and indentation.
 */
export function updateTaskText(line: ParsedLine, newText: string): ParsedLine {
  const indent = line.raw.match(/^(\s*)/)?.[1] || '';
  if (line.type === 'completed-task') {
    return { type: 'completed-task', raw: `${indent}- [x] ${newText}`, text: newText };
  }
  if (line.type === 'task') {
    return { type: 'task', raw: `${indent}- ${newText}`, text: newText };
  }
  return { ...line, raw: newText, text: newText };
}
