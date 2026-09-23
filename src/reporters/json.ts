import { serializeAuditReport, type AuditReport } from '../model/report.js';

/** Pretty-printed AuditReport. One trailing newline. No fields are dropped. */
export function renderJsonReport(report: AuditReport): string {
  return serializeAuditReport(report);
}
