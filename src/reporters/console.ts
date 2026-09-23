import type { Finding, Severity } from '../model/finding.js';
import type { AuditReport } from '../model/report.js';

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'ERROR',
  warning: 'WARN',
  info: 'INFO',
};

/** Plain-text summary. Does not print structured values or write to the terminal. */
export function renderConsoleReport(report: AuditReport): string {
  const lines = [
    `sitecutover ${report.version}`,
    '',
    `Source: ${report.summary.sourceOrigin}`,
    `Target: ${report.summary.targetOrigin}`,
    `Audited: ${report.timestamp}`,
    `Pages checked: ${String(report.summary.pagesExamined)}`,
    `Source pages: ${String(report.summary.sourcePages)}`,
    `Target pages: ${String(report.summary.targetPages)}`,
    '',
    countLine('ERROR', report.summary.counts.error),
    countLine('WARN', report.summary.counts.warning),
    countLine('INFO', report.summary.counts.info),
    '',
  ];

  if (report.findings.length === 0) {
    lines.push('No findings.');
  } else {
    lines.push(report.findings.map((finding) => renderFinding(finding)).join('\n\n'));
  }

  return `${lines.join('\n')}\n`;
}

function countLine(label: string, count: number): string {
  return `${label.padEnd(5)} ${String(count)}`;
}

function renderFinding(finding: Finding): string {
  const lines = [header(finding), indent(finding.message)];
  if (finding.sourceUrl !== undefined) {
    lines.push(field('Source', finding.sourceUrl));
  }
  if (finding.targetUrl !== undefined) {
    lines.push(field('Target', finding.targetUrl));
  }
  if (finding.referrers !== undefined && finding.referrers.length > 0) {
    lines.push('  Linked from:');
    for (const referrer of finding.referrers) {
      lines.push(indent(`- ${referrer}`, '    '));
    }
  }
  if (finding.help !== undefined) {
    lines.push(indent(`Help: ${finding.help}`));
  }
  return lines.join('\n');
}

function header(finding: Finding): string {
  const label = `${SEVERITY_LABEL[finding.severity]} ${finding.ruleId}`;
  if (finding.path === undefined || finding.path.includes('\n') || finding.path.includes('\r')) {
    return finding.path === undefined ? label : `${label}\n${indent(`Path: ${finding.path}`)}`;
  }
  return `${label} ${finding.path}`;
}

function field(label: string, value: string): string {
  return indent(`${label}: ${value}`);
}

function indent(value: string, prefix = '  '): string {
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}
