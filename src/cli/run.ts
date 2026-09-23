import { parseArgs } from 'node:util';
import { renderHelp } from './help.js';
import { VERSION } from './version.js';

export interface CliIo {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
}

export function runCli(argv: readonly string[], io: CliIo): number {
  try {
    const parsed = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });

    if (parsed.values.help === true) {
      io.stdout(renderHelp());
      return 0;
    }

    if (parsed.values.version === true) {
      io.stdout(`${VERSION}\n`);
      return 0;
    }

    if (parsed.positionals.length === 0) {
      io.stdout(renderHelp());
      return 0;
    }

    const command = parsed.positionals[0] ?? 'unknown';
    io.stderr(`Unknown command "${command}". Audit commands are not implemented yet.\n`);
    io.stderr('Run sitecutover --help for usage.\n');
    return 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid arguments.';
    io.stderr(`${message}\n`);
    io.stderr('Run sitecutover --help for usage.\n');
    return 2;
  }
}
