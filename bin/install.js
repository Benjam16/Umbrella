#!/usr/bin/env node
const fs = require('fs-extra');
const path = require('path');
const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');

const RUNTIMES = ['claude', 'cursor', 'gemini', 'openai', 'codex', 'opencode'];
let selectedRuntimes = [];
let isGlobal = true;
const MODULE_NAMES = [
  'coding',
  'lean',
  'tools',
  'memory',
  'orchestrate',
  'secure',
  'observe',
  'flow',
  'agent-runtime',
];

program
  .option('--claude', 'Install for Claude Code')
  .option('--cursor', 'Install for Cursor')
  .option('--gemini', 'Install for Gemini CLI')
  .option('--openai', 'Tag install for OpenAI / Codex-style workflows')
  .option('--codex', 'Same skills copy; tag install for OpenAI Codex-style use')
  .option('--local', 'Install to ./.umbrella instead of global')
  .option('--all', 'Install all modules (default set)')
  .parse();

async function main() {
  console.log(chalk.cyan.bold('☂️ Umbrella Installer'));

  const opts = program.opts();
  if (!opts.claude && !opts.cursor && !opts.gemini && !opts.openai && !opts.codex) {
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'runtimes',
        message: 'Which runtimes do you use?',
        choices: RUNTIMES,
        default: ['claude'],
      },
    ]);
    selectedRuntimes = answers.runtimes;
  } else {
    if (opts.claude) selectedRuntimes.push('claude');
    if (opts.cursor) selectedRuntimes.push('cursor');
    if (opts.gemini) selectedRuntimes.push('gemini');
    if (opts.openai) selectedRuntimes.push('openai');
    if (opts.codex) selectedRuntimes.push('codex');
  }

  isGlobal = !opts.local;

  const targetBase = isGlobal
    ? path.join(require('os').homedir(), '.umbrella')
    : path.join(process.cwd(), '.umbrella');

  console.log(chalk.green(`Installing to ${targetBase}...`));
  await fs.ensureDir(targetBase);

  for (const mod of MODULE_NAMES) {
    const src = path.join(__dirname, '..', 'modules', mod);
    const destSkills = path.join(targetBase, 'skills', `umb-${mod}`);
    const destCommands = path.join(targetBase, 'commands', `umb-${mod}`);
    const skillsPath = path.join(src, 'skills');
    const commandsPath = path.join(src, 'commands');

    if (!(await fs.pathExists(skillsPath)) && !(await fs.pathExists(commandsPath))) {
      continue;
    }

    await fs.ensureDir(destSkills);
    await fs.ensureDir(destCommands);

    if (await fs.pathExists(skillsPath)) {
      await fs.copy(skillsPath, destSkills, { overwrite: true });
    }
    if (await fs.pathExists(commandsPath)) {
      await fs.copy(commandsPath, destCommands, { overwrite: true });
    }
  }

  if (MODULE_NAMES.includes('agent-runtime')) {
    const runtimeSrc = path.join(__dirname, '..', 'runtime');
    if (await fs.pathExists(runtimeSrc)) {
      await fs.copy(runtimeSrc, path.join(targetBase, 'runtime'), { overwrite: true });
    }
    console.log(
      chalk.yellow('Agent runtime copied. From the package: `umbrella agent start`.'),
    );

    const agentToolsSrc = path.join(__dirname, '..', 'modules', 'agent-runtime', 'tools');
    const destAgentSkills = path.join(targetBase, 'skills', 'umb-agent-runtime');
    if (await fs.pathExists(agentToolsSrc)) {
      await fs.ensureDir(destAgentSkills);
      const bundleDocs = [
        ['README.md', 'MCP_TOOLS.md'],
        ['CRYPTO_MCP.md', 'CRYPTO_MCP.md'],
      ];
      for (const [name, destName] of bundleDocs) {
        const from = path.join(agentToolsSrc, name);
        if (await fs.pathExists(from)) {
          await fs.copy(from, path.join(destAgentSkills, destName), { overwrite: true });
        }
      }
      console.log(
        chalk.cyan(
          'Bundled MCP docs into skills/umb-agent-runtime (MCP_TOOLS.md, CRYPTO_MCP.md).',
        ),
      );
    }
  }

  const examplesSrc = path.join(__dirname, '..', 'examples');
  const examplesDest = path.join(targetBase, 'examples');
  if (await fs.pathExists(examplesSrc)) {
    await fs.copy(examplesSrc, examplesDest, { overwrite: true });
    console.log(
      chalk.cyan('Bundled examples/ (e.g. mcp-crypto.servers.json) into ~/.umbrella/examples.'),
    );
  }

  const featuresSrc = path.join(__dirname, '..', 'FEATURES.md');
  if (await fs.pathExists(featuresSrc)) {
    await fs.copy(featuresSrc, path.join(targetBase, 'FEATURES.md'), { overwrite: true });
    console.log(chalk.cyan('Copied FEATURES.md to umbrella home.'));
  }

  await fs.writeJson(
    path.join(targetBase, 'install-meta.json'),
    { runtimes: selectedRuntimes, installedAt: new Date().toISOString() },
    { spaces: 2 },
  );

  console.log(chalk.green.bold('✅ Umbrella installed!'));
  console.log('\nPoint your AI runtime at the copied skills/commands under:', targetBase);
  console.log('Use the Umbrella SKILL.md files as slash-command guides (/umb:...).');
  console.log(
    'Built-in references: FEATURES.md, skills/umb-agent-runtime/MCP_TOOLS.md, CRYPTO_MCP.md, examples/*',
  );
}

main().catch(console.error);
