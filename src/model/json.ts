import { AuditModelError } from './errors.js';

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export function serializeJson(value: unknown): string {
  return `${JSON.stringify(toJsonValue(value), null, 2)}\n`;
}

export function toJsonValue(value: unknown): JsonValue {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new AuditModelError('JSON numbers must be finite');
      }
      return value;
    case 'object':
      return objectToJsonValue(value);
    default:
      throw new AuditModelError('Value is not JSON serializable');
  }
}

function objectToJsonValue(value: object): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => {
      if (item === undefined) {
        throw new AuditModelError('JSON arrays cannot contain undefined');
      }
      return toJsonValue(item);
    });
  }

  if (!isPlainRecord(value)) {
    throw new AuditModelError('Value is not JSON serializable');
  }

  const sorted: Record<string, JsonValue> = {};
  for (const key of Object.keys(value).sort(compareStrings)) {
    const nested = value[key];
    if (nested !== undefined) {
      sorted[key] = toJsonValue(nested);
    }
  }
  return sorted;
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
