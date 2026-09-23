#!/usr/bin/env node
import { runCli } from './run.js';

const exitCode = await runCli(process.argv.slice(2), {
  stdout: (chunk) => {
    process.stdout.write(chunk);
  },
  stderr: (chunk) => {
    process.stderr.write(chunk);
  },
});

process.exitCode = exitCode;
