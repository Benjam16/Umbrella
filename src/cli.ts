#!/usr/bin/env node
import { program } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { spawn, spawnSync } from 'child_process';
import {
  ensureNoOtherDaemon,
  readDaemonPid,
  isPidRunning,
  removeDaemonPidFile,
  AGENT_PID_PATH,
} from '../modules/agent-runtime/core/agent-pid.js';
import { runDoctor } from './doctor.js';
import { resetSession } from '../modules/agent-runtime/core/session-control.js';
import {
  previewConfigApply,
  resolveConfigPath,
  loadDotEnvFiles,
} from '../modules/agent-runtime/core/umbrella-config.js';
import { runScaffoldShippingCli } from './scaffold-cli.js';

/** Repo root: works when running compiled `dist/src/cli.js` or `tsx src/cli.ts`. */
function resolvePackageRoot(): string {
  const oneUp = path.resolve(path.join(__dirname, '..'));
  const twoUp = path.resolve(path.join(__dirname, '..', '..'));
  if (fs.existsSync(path.join(oneUp, 'package.json'))) {
    return oneUp;
  }
  if (fs.existsSync(path.join(twoUp, 'package.json'))) {
    return twoUp;
  }
  return twoUp;
}

function runInstall(): void {
  require(path.join(resolvePackageRoot(), 'bin', 'install.js'));
}

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(resolvePackageRoot(), 'package.json');
    const j = fs.readJsonSync(pkgPath) as { version?: string };
    return j.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function resolveRuntimeEntry(): string {
  return path.join(resolvePackageRoot(), 'dist', 'runtime', 'index.js');
}

function runtimeEntryExists(): boolean {
  return fs.existsSync(resolveRuntimeEntry());
}

function shouldSkipAutoBuild(noAutoBuildFlag?: boolean): boolean {
  return (
    Boolean(noAutoBuildFlag) ||
    process.env.UMBRELLA_NO_AUTO_BUILD === '1' ||
    process.env.UMBRELLA_NO_AUTO_BUILD === 'true'
  );
}

function tryAutoBuild(): boolean {
  const root = resolvePackageRoot();
  const pkgJson = path.join(root, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    console.error(
      chalk.red(
        `Cannot auto-build: no package.json at ${root} (install from npm/git clone with dev files).`,
      ),
    );
    return false;
  }
  console.log(chalk.yellow('☂️ dist/ missing — running npm run build in package…'));
  const r = spawnSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
  if (r.status !== 0) {
    console.error(chalk.red('npm run build failed. Fix errors or run build manually.'));
    return false;
  }
  if (!runtimeEntryExists()) {
    console.error(
      chalk.red('Build finished but dist/runtime/index.js is still missing.'),
    );
    return false;
  }
  console.log(chalk.green('☂️ Build succeeded.'));
  return true;
}

async function startAgentDaemon(opts?: { noAutoBuild?: boolean }): Promise<void> {
  try {
    await ensureNoOtherDaemon();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(chalk.red(msg));
    process.exitCode = 1;
    return;
  }
  if (!runtimeEntryExists()) {
    if (shouldSkipAutoBuild(opts?.noAutoBuild)) {
      console.error(
        chalk.red(
          `Agent runtime not built: missing ${resolveRuntimeEntry()}\nRun: npm run build   (or omit --no-build / UMBRELLA_NO_AUTO_BUILD to auto-build)`,
        ),
      );
      process.exitCode = 1;
      return;
    }
    if (!tryAutoBuild()) {
      process.exitCode = 1;
      return;
    }
  }
  const entry = resolveRuntimeEntry();
  console.log(chalk.green(`Starting agent: ${entry}`));
  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

program
  .name('umbrella')
  .description('One CLI. One agent. Everything done.')
  .version(readPackageVersion());

program
  .command('install')
  .description('Run the interactive installer (copies modules to ~/.umbrella or ./.umbrella)')
  .action(() => {
    runInstall();
  });

const scaffold = program
  .command('scaffold')
  .description('Cookie-cutter projects for autonomous shipping workflows');

scaffold
  .command('cli')
  .description(
    'TypeScript CLI template (Commander, Vitest, GitHub Action → npm with OIDC provenance)',
  )
  .argument('<dest>', 'Empty directory (created if missing)')
  .argument('<packageName>', 'npm package name, e.g. @scope/my-cli')
  .option('--bin <name>', 'CLI binary name (default: unscoped part of package name)')
  .action((dest: string, packageName: string, opts: { bin?: string }) => {
    runScaffoldShippingCli(dest, packageName, opts.bin);
  });

program
  .command('up')
  .description(
    'Start the agent (same as `agent start`). Loads ~/.umbrella/.env then config.json inside the daemon.',
  )
  .option(
    '--dry-run',
    'Load .env (like the daemon), then show config.json merge preview — does not start the agent',
  )
  .option(
    '--no-build',
    'Do not run npm run build if dist/ is missing (also: UMBRELLA_NO_AUTO_BUILD=1)',
  )
  .action(async (opts: { dryRun?: boolean; noBuild?: boolean }) => {
    if (opts.dryRun) {
      const dot = loadDotEnvFiles();
      console.log(chalk.cyan.bold('☂️ Env & config dry-run\n'));
      if (dot.loadedPaths.length) {
        console.log(chalk.dim(`.env loaded: ${dot.loadedPaths.join(', ')}`));
      } else {
        console.log(
          chalk.gray(
            '.env loaded: (none — set UMBRELLA_DOTENV or create .env under UMBRELLA_HOME / ~/.umbrella)',
          ),
        );
      }
      const p = previewConfigApply();
      console.log('');
      console.log(chalk.gray(`config.json path: ${p.path}`));
      console.log(chalk.gray(`config.json exists: ${p.exists}`));
      if (p.wouldApply.length) {
        console.log(chalk.green(`Would apply from config (${p.wouldApply.length}): ${p.wouldApply.join(', ')}`));
      } else {
        console.log(
          chalk.gray(
            'Would apply from config: (none — missing file, empty env block, or keys already set after .env/shell)',
          ),
        );
      }
      if (p.skippedBecauseEnv.length) {
        console.log(
          chalk.yellow(
            `Skipped by existing env: ${p.skippedBecauseEnv.join(', ')}`,
          ),
        );
      }
      if (p.invalid) {
        console.log(chalk.red('config.json exists but is not valid JSON.'));
      }
      return;
    }
    await startAgentDaemon({ noAutoBuild: opts.noBuild });
  });

program
  .command('agent')
  .argument('<action>', 'start | stop | status')
  .option(
    '--no-build',
    'Do not run npm run build if dist/ is missing (UMBRELLA_NO_AUTO_BUILD=1)',
  )
  .description('Control the autonomous agent daemon (PID file in ~/.umbrella/agent.pid)')
  .action(async (action: string, opts: { noBuild?: boolean }) => {
    if (action === 'start') {
      await startAgentDaemon({ noAutoBuild: opts.noBuild });
      return;
    }
    if (action === 'stop') {
      const pid = await readDaemonPid();
      if (pid === null) {
        console.log(chalk.yellow('No agent pid file — nothing to stop.'));
        return;
      }
      if (!isPidRunning(pid)) {
        await removeDaemonPidFile();
        console.log(
          chalk.yellow(`Removed stale pid file (${pid} not running).`),
        );
        return;
      }
      try {
        process.kill(pid, 'SIGTERM');
        console.log(chalk.green(`Sent SIGTERM to Umbrella agent (pid ${pid}).`));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`Could not signal process: ${msg}`));
        process.exitCode = 1;
      }
      return;
    }
    if (action === 'status') {
      const pid = await readDaemonPid();
      if (pid === null) {
        console.log(chalk.yellow('Agent: not running (no pid file).'));
        return;
      }
      if (isPidRunning(pid)) {
        console.log(
          chalk.green(
            `Agent: running (pid ${pid}). File: ${AGENT_PID_PATH}`,
          ),
        );
      } else {
        console.log(
          chalk.yellow(
            `Agent: stale pid file (${pid} not running). Run: umbrella agent stop`,
          ),
        );
      }
      return;
    }
    console.log(chalk.red(`Unknown action: ${action}`));
    process.exitCode = 1;
  });

program
  .command('config-path')
  .description('Print the resolved config.json path (UMBRELLA_CONFIG or UMBRELLA_HOME/config.json)')
  .action(() => {
    console.log(resolveConfigPath());
  });

program
  .command('doctor')
  .description('Check Node version, agent pid, SQLite, LLM env, Telegram')
  .action(async () => {
    await runDoctor();
  });

program
  .command('session')
  .argument('<action>', 'reset')
  .description('Pi-style session file under ~/.umbrella/session.json')
  .action(async (action: string) => {
    if (action === 'reset') {
      await resetSession();
      console.log(chalk.green('Session file cleared. A new session starts on next agent heartbeat.'));
      return;
    }
    console.log(chalk.red('Unknown session action. Use: umbrella session reset'));
    process.exitCode = 1;
  });

program.parse();
