/// <reference lib="dom" />
/**
 * The pure parts of `bry-datagrid` (Database DB02), the same as Brydio's
 * `packages/app/src/apps/catalogue/draw/datagrid-model.ts`: reading a cell, the
 * clipboard both ways, and the fill handle's series. Teable's grid does the
 * same (`packages/core/src/utils/clipboard.ts`, MIT, for the text; its fill
 * rules are described in the gap audit and written fresh here).
 */

export type CellType =
  | "text" | "long_text" | "number" | "currency" | "percent" | "rating" | "date" | "datetime" | "checkbox"
  | "select" | "multi_select" | "person" | "link" | "attachment" | "url" | "email" | "phone";

export interface GridColumn {
  key: string;
  heading: string;
  type: CellType;
  width?: "sm" | "md" | "lg" | "xl";
  readOnly?: boolean;
  primary?: boolean;
  precision?: number;
  symbol?: string;
  max?: number;
  choices?: { value: string; hue?: string }[];
  statistic?: string;
  description?: string;
}

/** Kinds whose cell holds a JSON list of labels. */
export const LIST_TYPES: ReadonlySet<CellType> = new Set(["multi_select", "person", "link", "attachment"]);

/** Kinds the grid edits itself; the rest raise `open` for the app's own editor. */
export const INLINE_TYPES: ReadonlySet<CellType> = new Set(["text", "number", "currency", "percent", "rating", "date", "datetime", "url", "email", "phone", "select", "checkbox"]);

/** A list cell's labels. */
export function labelsOf(cell: string): string[] {
  if (!cell) return [];
  try {
    const parsed = JSON.parse(cell) as unknown;

    return Array.isArray(parsed) ? parsed.map(String) : [cell];
  } catch {
    return [cell];
  }
}

const NUMBER_TYPES: ReadonlySet<CellType> = new Set(["number", "currency", "percent"]);

/** A cell as a person reads it: numbers formatted, dates short, lists joined. */
export function display(column: GridColumn, cell: string, locale = "en-GB"): string {
  if (!cell) return "";
  if (LIST_TYPES.has(column.type)) return labelsOf(cell).join(", ");
  if (NUMBER_TYPES.has(column.type)) {
    const value = Number(cell);

    if (!Number.isFinite(value)) return cell;
    const precision = column.precision ?? (column.type === "number" ? undefined : 2);
    const shown = column.type === "percent" ? value : value;
    const text = new Intl.NumberFormat(locale, precision === undefined ? { maximumFractionDigits: 10 } : { minimumFractionDigits: precision, maximumFractionDigits: precision }).format(shown);

    if (column.type === "percent") return `${text}%`;
    if (column.type === "currency") return `${column.symbol ?? ""}${text}`;

    return text;
  }
  if (column.type === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cell);

    return match ? new Date(Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!)).toLocaleDateString(locale, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : cell;
  }
  if (column.type === "datetime") {
    const at = Date.parse(cell);

    return Number.isNaN(at) ? cell : new Date(at).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  if (column.type === "checkbox") return cell === "true" ? "✓" : "";

  return cell;
}

/** A cell as copied: plain text a spreadsheet takes (lists joined by commas, dates as ISO). */
export function copied(column: GridColumn, cell: string): string {
  if (LIST_TYPES.has(column.type)) return labelsOf(cell).join(", ");
  if (column.type === "checkbox") return cell === "true" ? "TRUE" : "FALSE";

  return cell;
}

const quoteTsv = (text: string) => (/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A range as tab-separated text and an HTML table, as a spreadsheet puts them on the clipboard. */
export function toClipboard(columns: GridColumn[], cells: string[][]): { text: string; html: string } {
  const plain = cells.map((row) => row.map((cell, at) => copied(columns[at]!, cell)));
  const text = plain.map((row) => row.map(quoteTsv).join("\t")).join("\n");
  const html = `<table>${plain
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell).replace(/\n/g, '<br style="mso-data-placement:same-cell;">')}</td>`).join("")}</tr>`)
    .join("")}</table>`;

  return { text, html };
}

/**
 * Clipboard text as rows of cells (T `parseClipboardText`): tabs between
 * cells, new lines between rows, and a cell in double quotes may hold tabs,
 * new lines and doubled quotes. A trailing new line adds no row.
 */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let at = 0;
  const input = text.replace(/\r\n?/g, "\n");

  while (at < input.length) {
    const char = input[at]!;

    if (quoted) {
      if (char === '"' && input[at + 1] === '"') {
        cell += '"';
        at += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
        at += 1;
        continue;
      }
      cell += char;
      at += 1;
      continue;
    }
    if (char === '"' && cell === "") {
      quoted = true;
      at += 1;
      continue;
    }
    if (char === "\t") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
    at += 1;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

/** An HTML table from the clipboard (Excel, Google Sheets) as rows of cells; null when it holds none. */
export function parseHtmlTable(html: string, parse: (html: string) => Document = (source) => new DOMParser().parseFromString(source, "text/html")): string[][] | null {
  if (!/<table/i.test(html)) return null;
  const doc = parse(html);
  const table = doc.querySelector("table");

  if (!table) return null;
  const rows: string[][] = [];

  for (const tr of Array.from(table.querySelectorAll("tr"))) {
    const cells: string[] = [];

    for (const td of Array.from(tr.querySelectorAll("td, th"))) {
      // A line break inside a cell stays one cell.
      for (const br of Array.from(td.querySelectorAll("br"))) br.replaceWith("\n");
      const text = (td.textContent ?? "").replace(/\u00a0/g, " ").trim();
      const span = Number((td as HTMLTableCellElement).colSpan) || 1;

      cells.push(text);
      for (let more = 1; more < span; more += 1) cells.push("");
    }
    rows.push(cells);
  }

  return rows.length ? rows : null;
}

const dayOf = (cell: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(cell);

  return match ? Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!) : null;
};
const dayText = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * What the fill handle writes into `count` cells after `source` (one
 * column's selected cells), as Teable's grid does: two or more different
 * numbers with no blanks go on as a series by their last step; two
 * different dates go on by their step in days; anything else repeats.
 */
export function fillSeries(type: CellType, source: string[], count: number): string[] {
  if (!source.length || count <= 0) return [];
  const numbers = source.map((one) => (one.trim() === "" ? Number.NaN : Number(one)));

  if (NUMBER_TYPES.has(type) || type === "rating" || type === "text") {
    if (source.length >= 2 && numbers.every(Number.isFinite) && new Set(numbers).size > 1) {
      const step = numbers[numbers.length - 1]! - numbers[numbers.length - 2]!;
      const last = numbers[numbers.length - 1]!;
      const places = Math.max(...source.map((one) => (one.split(".")[1] ?? "").length));

      return Array.from({ length: count }, (_, at) => String(Number((last + step * (at + 1)).toFixed(places))));
    }
  }
  if ((type === "date" || type === "datetime") && source.length === 2) {
    const [a, b] = source.map(dayOf);

    if (a !== null && b !== null && a !== b) {
      const step = b! - a!;
      const time = type === "datetime" ? source[1]!.slice(10) : "";

      return Array.from({ length: count }, (_, at) => `${dayText(b! + step * (at + 1))}${time}`);
    }
  }

  return Array.from({ length: count }, (_, at) => source[at % source.length]!);
}

/** A rectangle of cells: rows and columns as indexes, inclusive. */
export interface Range {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

export const normal = (range: Range): Range => ({
  r0: Math.min(range.r0, range.r1),
  r1: Math.max(range.r0, range.r1),
  c0: Math.min(range.c0, range.c1),
  c1: Math.max(range.c0, range.c1),
});

/** Pasted rows laid from a cell: the edits that fit, and the rows past the end. A single cell fills the whole selection. */
export function pasteEdits(columns: GridColumn[], rows: { id: string }[], at: Range, pasted: string[][]): { edits: { row: string; key: string; value: string }[]; extra: Record<string, string>[] } {
  const range = normal(at);
  const edits: { row: string; key: string; value: string }[] = [];
  const extra: Record<string, string>[] = [];
  const single = pasted.length === 1 && pasted[0]!.length === 1;
  const height = single ? range.r1 - range.r0 + 1 : pasted.length;
  const width = single ? range.c1 - range.c0 + 1 : Math.max(...pasted.map((row) => row.length));

  for (let dr = 0; dr < height; dr += 1) {
    const r = range.r0 + dr;
    const values: Record<string, string> = {};

    for (let dc = 0; dc < width; dc += 1) {
      const column = columns[range.c0 + dc];
      const value = single ? pasted[0]![0]! : pasted[dr]?.[dc];

      if (!column || column.readOnly || value === undefined) continue;
      if (r < rows.length) edits.push({ row: rows[r]!.id, key: column.key, value });
      else values[column.key] = value;
    }
    if (r >= rows.length && Object.keys(values).length) extra.push(values);
  }

  return { edits, extra };
}

/** How tall a row is drawn for each `lines` setting. */
export const ROW_PX = { one: 32, two: 56, three: 88, four: 128 } as const;
