import { describe, expect, it } from 'vitest';
import { runCli } from './run.js';
import { VERSION } from './version.js';

function capture(argv: readonly string[]): { code: number; stdout: string; stderr: string } {
  let stdout = '';
  let stderr = '';
  const code = runCli(argv, {
    stdout: (chunk) => {
      stdout += chunk;
    },
    stderr: (chunk) => {
      stderr += chunk;
    },
  });
  return { code, stdout, stderr };
}

describe('runCli', () => {
  it('prints help for --help and -h', () => {
    for (const argv of [['--help'], ['-h'], []] as const) {
      const result = capture(argv);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`sitecutover ${VERSION}`);
      expect(result.stdout).toContain('not implemented yet');
    }
  });

  it('prints the package version', () => {
    for (const argv of [['--version'], ['-v']] as const) {
      const result = capture(argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(`${VERSION}\n`);
      expect(result.stderr).toBe('');
    }
  });

  it('rejects unimplemented commands before any audit work', () => {
    const result = capture(['compare']);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('not implemented yet');
  });

  it('rejects unknown options', () => {
    const result = capture(['--format', 'json']);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--help');
  });
});
