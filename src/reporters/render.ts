import { AuditModelError } from '../model/errors.js';
import type { AuditReport, ReportFormat } from '../model/report.js';
import { renderConsoleReport } from './console.js';
import { renderJsonReport } from './json.js';
import { renderMarkdownReport } from './markdown.js';

export function renderReport(report: AuditReport, format: ReportFormat): string {
  switch (format) {
    case 'console':
      return renderConsoleReport(report);
    case 'json':
      return renderJsonReport(report);
    case 'markdown':
      return renderMarkdownReport(report);
    default: {
      const unexpected: never = format;
      throw new AuditModelError(`Unexpected report format: ${String(unexpected)}`);
    }
  }
}
