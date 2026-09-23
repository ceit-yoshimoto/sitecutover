import type { Finding, Severity } from '../model/finding.js';
import type { AuditReport } from '../model/report.js';

const SEVERITY_HEADING: Record<Severity, string> = {
  error: 'Errors',
  warning: 'Warnings',
  info: 'Info',
};

/** GitHub-friendly Markdown. User text stays inside code so it cannot open a heading or table. */
export function renderMarkdownReport(report: AuditReport): string {
  const lines = [
    '# sitecutover report',
    '',
    `- Version: ${inlineCode(report.version)}`,
    `- Source: ${inlineCode(report.summary.sourceOrigin)}`,
    `- Target: ${inlineCode(report.summary.targetOrigin)}`,
    `- Audited: ${inlineCode(report.timestamp)}`,
    `- Pages checked: ${String(report.summary.pagesExamined)}`,
    `- Source pages: ${String(report.summary.sourcePages)}`,
    `- Target pages: ${String(report.summary.targetPages)}`,
    `- Errors: ${String(report.summary.counts.error)}`,
    `- Warnings: ${String(report.summary.counts.warning)}`,
    `- Info: ${String(report.summary.counts.info)}`,
    '',
  ];

  if (report.findings.length === 0) {
    lines.push('No findings.');
  } else {
    let previous: Severity | null = null;
    for (const finding of report.findings) {
      if (finding.severity !== previous) {
        lines.push(`## ${SEVERITY_HEADING[finding.severity]}`, '');
        previous = finding.severity;
      }
      lines.push(renderFinding(finding), '');
    }
  }

  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

function renderFinding(finding: Finding): string {
  const lines = [`### ${finding.ruleId}`, ''];
  if (finding.path !== undefined) {
    lines.push(`- Path: ${codeValue(finding.path)}`);
  }
  if (finding.sourceUrl !== undefined) {
    lines.push(`- Source: ${codeValue(finding.sourceUrl)}`);
  }
  if (finding.targetUrl !== undefined) {
    lines.push(`- Target: ${codeValue(finding.targetUrl)}`);
  }
  if (finding.referrers !== undefined && finding.referrers.length > 0) {
    lines.push('- Linked from:');
    for (const referrer of finding.referrers) {
      lines.push(`  - ${codeValue(referrer)}`);
    }
  }
  if (lines.length > 2) {
    lines.push('');
  }
  lines.push(fencedBlock(finding.message));
  if (finding.help !== undefined) {
    lines.push('', fencedBlock(finding.help));
  }
  return lines.join('\n');
}

function codeValue(value: string): string {
  if (value.includes('\n') || value.includes('\r')) {
    return `\n${fencedBlock(value)}`;
  }
  return inlineCode(value);
}

function inlineCode(value: string): string {
  const fence = '`'.repeat(longestRun(value) + 1);
  const pad =
    value.startsWith('`') || value.endsWith('`') || value.startsWith(' ') || value.endsWith(' ');
  const body = pad ? ` ${value} ` : value;
  return `${fence}${body}${fence}`;
}

function fencedBlock(value: string): string {
  const fence = '`'.repeat(Math.max(3, longestRun(value) + 1));
  return `${fence}\n${value.replace(/\n$/u, '')}\n${fence}`;
}

function longestRun(value: string): number {
  let longest = 0;
  let run = 0;
  for (const char of value) {
    if (char === '`') {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return longest;
}
