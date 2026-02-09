/**
 * Shared archive logic used by both the Chrome extension and web frontend.
 * Manages the archive file format: a "Last updated:" timestamp line followed
 * by date-headed sections of completed tasks, sorted most-recent-first.
 */

export interface ArchiveSection {
  header: string;
  date: Date | null;
  tasks: string[];
}

export function getArchiveFilePath(originalFilePath: string): string {
  const parts = originalFilePath.split('.');
  if (parts.length > 1) {
    parts[parts.length - 2] += '.archive';
    return parts.join('.');
  }
  return originalFilePath + '.archive';
}

export function parseDateFromHeader(header: string): Date | null {
  const match = header.match(/^## (\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  return null;
}

export function removeTimestampFromArchive(content: string): string {
  const lines = content.split('\n');
  if (lines.length > 0 && lines[0].startsWith('Last updated:')) {
    if (lines.length > 1 && lines[1].trim() === '') {
      return lines.slice(2).join('\n');
    }
    return lines.slice(1).join('\n');
  }
  return content;
}

export function generateTimestampHeader(): string {
  const now = new Date();
  const humanDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const humanTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  return `Last updated: ${humanDate} at ${humanTime}`;
}

export function parseArchiveIntoSections(content: string): ArchiveSection[] {
  const lines = content.split('\n');
  const sections: ArchiveSection[] = [];
  let currentSection: ArchiveSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    if (trimmedLine.match(/^## \d{4}-\d{2}-\d{2}/)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        header: trimmedLine,
        date: parseDateFromHeader(trimmedLine),
        tasks: [],
      };
    } else if (currentSection && trimmedLine.startsWith('- [x]')) {
      // Collect the task plus any indented adornment lines that follow
      let taskBlock = line;
      while (i + 1 < lines.length && lines[i + 1].length > 0 && lines[i + 1][0] === ' ') {
        i++;
        taskBlock += '\n' + lines[i];
      }
      currentSection.tasks.push(taskBlock);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

export function rebuildArchiveFromSections(sections: ArchiveSection[]): string {
  const result: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    result.push(section.header);
    for (const task of section.tasks) {
      result.push(task);
    }
    if (i < sections.length - 1) {
      result.push('');
    }
  }

  return result.join('\n');
}

/**
 * Insert a completed task into archive content under the given date heading.
 * Returns the updated archive content string.
 */
export function insertTaskIntoArchive(
  archiveContent: string,
  dateHeading: string,
  completedTask: string,
): string {
  const dateHeader = `## ${dateHeading}`;
  const contentWithoutTimestamp = removeTimestampFromArchive(archiveContent);
  const sections = parseArchiveIntoSections(contentWithoutTimestamp);

  let targetSection = sections.find((s) => s.header === dateHeader);
  if (!targetSection) {
    targetSection = {
      header: dateHeader,
      date: parseDateFromHeader(dateHeader),
      tasks: [],
    };
    sections.push(targetSection);
  }

  targetSection.tasks.push(completedTask);

  // Sort sections by date, most recent first
  sections.sort((a, b) => {
    if (a.date && b.date) {
      return b.date.getTime() - a.date.getTime();
    }
    return 0;
  });

  const timestampHeader = generateTimestampHeader();
  const archiveBody = rebuildArchiveFromSections(sections);
  return timestampHeader + '\n\n' + archiveBody;
}
