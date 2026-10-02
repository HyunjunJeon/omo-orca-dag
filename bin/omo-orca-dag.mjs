#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2);
const help = `omo-orca-dag — install the OmO DAG viewer for Orca

Usage:
  omo-orca-dag install [--dry-run] [--agent-dir PATH] [--lang en|ko|zh-cn]
  omo-orca-dag --help
  omo-orca-dag --version

Install OmO and Orca separately. After installation, start OmO in an Orca
terminal pane, or run /reload in an existing session.
The first installation defaults to English. Updates keep the selected language.
`;

try {
  if (!args.length || args.includes('--help') || args.includes('-h')) {
    console.log(help);
  } else if (args.length === 1 && ['--version', '-v'].includes(args[0])) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
  } else {
    if (args[0] !== 'install') throw new Error(`Unknown command: ${args[0]}. Use --help.`);
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--dry-run') continue;
      if (args[i] === '--agent-dir') {
        if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error('--agent-dir requires a path.');
        i++;
      } else if (args[i] === '--lang') {
        if (!['en', 'ko', 'zh-cn'].includes(args[i + 1])) throw new Error('--lang must be en, ko, or zh-cn.');
        i++;
      } else throw new Error(`Unknown option: ${args[i]}. Use --help.`);
    }
    // Installs straight from Git skip the prepack build; they ship the source installer instead.
    const built = new URL('../dist/scripts/install.mjs', import.meta.url);
    await import((existsSync(built) ? built : new URL('../scripts/install.mjs', import.meta.url)).href);
  }
} catch (error) {
  console.error(`omo-orca-dag: ${error.message}`);
  process.exitCode = 1;
}
