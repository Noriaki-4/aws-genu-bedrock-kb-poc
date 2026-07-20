import {
  SqlTemplateCell,
  SqlTemplateMockResult,
} from 'generative-ai-use-cases';

// RFC 4180: a field must be quoted when it contains a comma, a quote or a line
// break, and inner quotes are doubled.
const NEEDS_QUOTING = /[",\r\n]/;

const escapeCell = (value: SqlTemplateCell | undefined): string => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// The column definition drives both the header and the cell order, so a row
// whose keys are ordered differently still lines up.
export const toCsv = (result: SqlTemplateMockResult): string =>
  [
    result.columns.map((column) => escapeCell(column.label)),
    ...result.rows.map((row) =>
      result.columns.map((column) => escapeCell(row[column.key]))
    ),
  ]
    .map((cells) => cells.join(','))
    .join('\r\n');

export const csvFileName = (templateId: string, date = new Date()): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${templateId}_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}.csv`;
};

export const downloadCsv = (fileName: string, csv: string): void => {
  // Excel only detects UTF-8 when the file starts with a BOM; without it the
  // Japanese labels come out garbled.
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
