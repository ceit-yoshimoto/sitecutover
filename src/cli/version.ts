import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(here, '..', '..', 'package.json');
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  if (
    !isRecord(parsed) ||
    typeof parsed['version'] !== 'string' ||
    parsed['version'].length === 0
  ) {
    throw new Error(`Unable to read version from ${packageJsonPath}`);
  }

  return parsed['version'];
}

export const VERSION = readPackageVersion();
