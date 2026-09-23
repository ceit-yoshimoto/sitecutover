import { VERSION } from './version.js';

export function renderHelp(): string {
  return [
    `sitecutover ${VERSION}`,
    '',
    'Detect website migration and production-cutover regressions.',
    '',
    'Usage:',
    '  sitecutover --help',
    '  sitecutover --version',
    '',
    'Options:',
    '  -h, --help     Show this help',
    '  -v, --version  Show the version',
    '',
    'The compare command is planned for v0.1 and is not implemented yet.',
    '',
  ].join('\n');
}
