export class AuditModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditModelError';
  }
}
