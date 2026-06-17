const MAX_SUMMARY_LENGTH = 2000;

interface NodeSummary {
  tag: string;
  id?: string;
  className?: string;
  childCount: number;
  children: NodeSummary[];
}

function summarizeElement(element: Element): NodeSummary | null {
  const tag = element.tagName.toLowerCase();
  const id = element.id || undefined;
  const className = element.className && typeof element.className === 'string' ? element.className : undefined;

  const childElements = Array.from(element.children);
  const children: NodeSummary[] = [];

  for (const child of childElements) {
    const summary = summarizeElement(child);
    if (summary) {
      children.push(summary);
    }
  }

  return {
    tag,
    id,
    className,
    childCount: childElements.length,
    children,
  };
}

function formatSummary(summary: NodeSummary, indent: number): string {
  const prefix = '  '.repeat(indent);
  let line = `${prefix}${summary.tag}`;

  if (summary.id) {
    line += `#${summary.id}`;
  }
  if (summary.className) {
    line += `.${summary.className.split(/\s+/u).join('.')}`;
  }
  if (summary.childCount > 1 && summary.children.length === 0) {
    line += ` (x${summary.childCount})`;
  }

  const lines = [line];
  for (const child of summary.children) {
    lines.push(formatSummary(child, indent + 1));
  }

  return lines.join('\n');
}

export function generateDomSummary(html: string): string {
  if (!html.trim()) {
    return '';
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const summaries: string[] = [];
    for (const child of Array.from(doc.body.children)) {
      const summary = summarizeElement(child);
      if (summary) {
        summaries.push(formatSummary(summary, 0));
      }
    }

    let result = summaries.join('\n');
    if (result.length > MAX_SUMMARY_LENGTH) {
      result = `${result.slice(0, MAX_SUMMARY_LENGTH)}\n... (truncated)`;
    }

    return result;
  } catch {
    return '';
  }
}
