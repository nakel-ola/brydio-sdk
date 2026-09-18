export interface MarkdownOptions {
  linkFor?: (href: string) => string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function inline(value: string, options: MarkdownOptions): string {
  const escaped = escapeHtml(value);
  const links = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const target = options.linkFor?.(href) ?? href;
    return `<a href="${escapeHtml(target)}">${label}</a>`;
  });

  return links
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
}

function isTableDivider(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function isBlockStart(line: string, next = ''): boolean {
  return /^#{1,6}\s/.test(line)
    || /^```/.test(line)
    || /^[-*]\s+/.test(line)
    || /^\d+\.\s+/.test(line)
    || (line.includes('|') && isTableDivider(next));
}

export function renderMarkdown(source: string, options: MarkdownOptions = {}): string {
  const lines = source.replaceAll('\r\n', '\n').split('\n');
  const html: string[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? '';
    const next = lines[index + 1] ?? '';

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([^\s]*)\s*$/);
    if (fence) {
      const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : '';
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? '')) code.push(lines[index++] ?? '');
      if (index < lines.length) index += 1;
      html.push(`<pre><code${language}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1]!.length;
      const title = heading[2]!;
      html.push(`<h${level} id="${slug(title)}">${inline(title, options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.includes('|') && isTableDivider(next)) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim() !== '') {
        rows.push(tableCells(lines[index++] ?? ''));
      }
      html.push(`<table><thead><tr>${headers.map(cell => `<th>${inline(cell, options)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell, options)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      const tag = unordered ? 'ul' : 'ol';
      const items: string[] = [];
      while (index < lines.length) {
        const match = tag === 'ul'
          ? (lines[index] ?? '').match(/^[-*]\s+(.+)$/)
          : (lines[index] ?? '').match(/^\d+\.\s+(.+)$/);
        if (!match) break;
        const content = [match[1]!];
        index += 1;
        while (/^\s{2,}\S/.test(lines[index] ?? '')) content.push((lines[index++] ?? '').trim());
        items.push(`<li>${inline(content.join(' '), options)}</li>`);
      }
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && (lines[index] ?? '').trim() !== '' && !isBlockStart(lines[index] ?? '', lines[index + 1] ?? '')) {
      paragraph.push((lines[index++] ?? '').trim());
    }
    html.push(`<p>${inline(paragraph.join(' '), options)}</p>`);
  }

  return html.join('\n');
}
