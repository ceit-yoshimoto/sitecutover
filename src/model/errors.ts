export class AuditModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditModelError';
  }
}

/** The audit could not be produced, including a source baseline that could not be fetched. */
export class AuditRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditRuntimeError';
  }
}
