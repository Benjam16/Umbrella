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
import {
  DEFAULT_WEB_URL,
  announceNode,
  clearNodeConfig,
  fetchRunSnapshot,
  heartbeatNode,
  hydrateContext,
  loadNodeConfig,
  maskToken,
  mintNodeConfig,
  nodeConfigPath,
  planLocalLayout,
  resolveWebUrl,
  saveNodeConfig,
  serveLoop,
  serveOnce,
  sha256Hex,
  statusEmoji,
  writeLocalLayout,
} from './web-bridge/index.js';

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

// ---------------------------------------------------------------------------
// Web bridge: connect + pull — see platform/apps/web/src/app/app/nodes/page.tsx
// and GET /api/v1/runs/:id on the paired web deployment.
// ---------------------------------------------------------------------------

program
  .command('connect')
  .description(
    'Mint a pairing code + node token for this machine. Paste the code into /app/nodes on the website to register this CLI as a Remote Node.',
  )
  .option('--web <url>', `Umbrella web base URL (default: ${DEFAULT_WEB_URL})`)
  .option('--label <name>', 'Friendly label for this node (e.g. "work laptop")')
  .option('--rotate', 'Rotate token + pairing code even if this node is already paired')
  .option('--show', 'Print existing pairing (if any) without rotating')
  .option('--clear', 'Unpair this machine and delete ~/.umbrella/node.json')
  .action(
    async (opts: {
      web?: string;
      label?: string;
      rotate?: boolean;
      show?: boolean;
      clear?: boolean;
    }) => {
      if (opts.clear) {
        const removed = clearNodeConfig();
        console.log(
          removed
            ? chalk.yellow('Node config cleared. This machine is no longer paired.')
            : chalk.dim('No node config to clear.'),
        );
        return;
      }

      const existing = loadNodeConfig();

      if (opts.show) {
        if (!existing) {
          console.log(chalk.yellow('Not paired. Run: umbrella connect'));
          process.exitCode = 1;
          return;
        }
        printPairing(existing);
        return;
      }

      const shouldRotate = opts.rotate || !existing;
      const cfg = shouldRotate
        ? mintNodeConfig({
            webUrl: opts.web ?? existing?.webUrl,
            label: opts.label ?? existing?.label,
            reuseId: existing?.nodeId ?? null,
          })
        : existing!;

      if (shouldRotate) {
        const p = saveNodeConfig(cfg);
        console.log(chalk.green(`Node config written to ${p}`));
      } else {
        console.log(chalk.dim('Using existing pairing (pass --rotate to mint a new one).'));
      }

      // Announce to the web so the pairing code is live server-side. This is
      // what upgrades the pairing from "localStorage trick" to a real
      // token-hash-backed identity. Skipped when --rotate wasn't required
      // because the announcement is already on the server from before.
      if (shouldRotate) {
        try {
          const res = await announceNode(cfg.webUrl, {
            nodeId: cfg.nodeId,
            pairingCode: cfg.pairingCode,
            tokenHash: sha256Hex(cfg.nodeToken),
            hostname: cfg.hostname,
            label: cfg.label ?? null,
          });
          console.log(
            chalk.dim(
              `→ announced to ${cfg.webUrl} · code expires ${new Date(res.expiresAt).toLocaleTimeString()}`,
            ),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(chalk.yellow(`! announce skipped: ${msg}`));
          console.log(
            chalk.dim(
              '  The pairing will still work once you reach the web manually, but the server-side claim will fail until you retry.',
            ),
          );
        }
      }

      printPairing(cfg);
    },
  );

function printPairing(cfg: {
  nodeId: string;
  nodeToken: string;
  webUrl: string;
  pairingCode: string;
  hostname: string;
  label?: string;
}): void {
  const url = `${cfg.webUrl}/app/nodes`;
  console.log('');
  console.log(chalk.cyan.bold('☂️  Umbrella Remote Node pairing'));
  console.log(chalk.dim('   Paste the pairing code into the website:'));
  console.log('');
  console.log(`   ${chalk.cyan('pairing code:')} ${chalk.bold.yellow(cfg.pairingCode)}`);
  console.log(`   ${chalk.cyan('node id:     ')} ${cfg.nodeId}`);
  console.log(`   ${chalk.cyan('hostname:    ')} ${cfg.hostname}${cfg.label ? ` (${cfg.label})` : ''}`);
  console.log(`   ${chalk.cyan('web url:     ')} ${chalk.underline(url)}`);
  console.log(`   ${chalk.cyan('token:       ')} ${chalk.dim(maskToken(cfg.nodeToken))}`);
  console.log('');
  console.log(
    chalk.dim(
      '   The token is also stored in ~/.umbrella/node.json (chmod 0600). Share the pairing code, never the token.',
    ),
  );
  console.log('');
  console.log(chalk.dim('   Next: open the URL, paste the code, and start an Agent in your browser.'));
  console.log(chalk.dim('         Pull any web run locally with:  umbrella pull <runId>'));
}

program
  .command('status')
  .description(
    'Show pairing state for this machine and ping the web via heartbeat.',
  )
  .option('--json', 'Print the raw response as JSON')
  .action(async (opts: { json?: boolean }) => {
    const cfg = loadNodeConfig();
    if (!cfg) {
      console.log(chalk.yellow('Not paired. Run: umbrella connect'));
      process.exitCode = 1;
      return;
    }

    const webUrl = cfg.webUrl;
    let res;
    try {
      res = await heartbeatNode(webUrl, {
        nodeId: cfg.nodeId,
        nodeToken: cfg.nodeToken,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(msg));
      process.exitCode = 1;
      return;
    }

    if (opts.json) {
      process.stdout.write(JSON.stringify(res, null, 2) + '\n');
      return;
    }

    const dot = res.paired ? chalk.green('●') : chalk.yellow('○');
    const state = res.paired ? chalk.green('paired') : chalk.yellow('pending');
    const lastSeen = res.node.lastSeenAt
      ? new Date(res.node.lastSeenAt).toLocaleTimeString()
      : 'never';

    console.log('');
    console.log(chalk.cyan.bold('☂️  Umbrella node status'));
    console.log(`   ${dot} ${state}`);
    console.log(`   ${chalk.dim('node id:  ')} ${res.node.nodeId}`);
    console.log(`   ${chalk.dim('label:    ')} ${res.node.label}`);
    console.log(`   ${chalk.dim('hostname: ')} ${res.node.hostname ?? cfg.hostname}`);
    console.log(`   ${chalk.dim('web url:  ')} ${webUrl}`);
    console.log(`   ${chalk.dim('last seen:')} ${lastSeen}`);
    console.log(`   ${chalk.dim('config:   ')} ${nodeConfigPath()}`);
    if (!res.paired) {
      console.log('');
      console.log(
        chalk.yellow(
          `   waiting for pairing code ${cfg.pairingCode} to be claimed at ${webUrl}/app/nodes`,
        ),
      );
    }
    console.log('');
  });

program
  .command('pull')
  .argument('<runId>', 'Run ID from the web terminal (shown in the URL and in the Eject toast)')
  .description(
    'Hydrate a remote run into ./research/<runId>/ (plan, events, logs, summary, artifacts).',
  )
  .option('--from <url>', 'Web deployment to pull from (overrides config + env)')
  .option('--dir <path>', 'Destination root (default: ./research)')
  .option('--force', 'Overwrite an existing ./research/<runId>/ directory without prompting')
  .option('--json', 'Print the hydrated snapshot as JSON instead of writing files')
  .action(
    async (
      runId: string,
      opts: { from?: string; dir?: string; force?: boolean; json?: boolean },
    ) => {
      const webUrl = resolveWebUrl(opts.from ?? null);
      const cfg = loadNodeConfig();
      const token = cfg?.nodeToken ?? null;
      const nodeId = cfg?.nodeId ?? null;

      console.log(
        chalk.dim(
          `→ GET ${webUrl}/api/v1/runs/${runId}${token ? ` (as ${nodeId})` : ''}`,
        ),
      );

      let snapshot;
      try {
        snapshot = await fetchRunSnapshot(webUrl, runId, { token, nodeId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(msg));
        process.exitCode = 1;
        return;
      }

      const hydrated = hydrateContext(snapshot);

      if (opts.json) {
        process.stdout.write(JSON.stringify(hydrated, null, 2) + '\n');
        return;
      }

      const destRoot = path.resolve(process.cwd(), opts.dir ?? 'research');
      const runDir = path.join(destRoot, runId);

      if (fs.existsSync(runDir) && !opts.force) {
        console.error(
          chalk.red(
            `refusing to overwrite ${runDir} — re-run with --force to replace, or --dir <path> to pull elsewhere.`,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const files = planLocalLayout(hydrated);
      const { written } = writeLocalLayout(runDir, files);

      const run = hydrated.run;
      const statusLabel =
        `${statusEmoji(run.status)} ${run.status}` +
        (hydrated.eject ? chalk.yellow(' (ejected)') : '');

      console.log('');
      console.log(chalk.green.bold('☂️  Pulled mission'));
      console.log(`   ${chalk.dim('run:      ')} ${run.id}`);
      console.log(`   ${chalk.dim('blueprint:')} ${run.blueprintId}`);
      console.log(`   ${chalk.dim('goal:     ')} ${run.goal}`);
      console.log(`   ${chalk.dim('status:   ')} ${statusLabel}`);
      console.log(`   ${chalk.dim('nodes:    ')} ${hydrated.plan.length}`);
      console.log(`   ${chalk.dim('events:   ')} ${snapshot.events.length}`);
      console.log(`   ${chalk.dim('artifacts:')} ${hydrated.artifacts.length}`);
      console.log('');
      console.log(chalk.dim(`   wrote ${written.length} files → ${runDir}`));

      if (hydrated.eject) {
        console.log('');
        console.log(
          chalk.yellow(
            `⚑ This run was ejected. Blocking nodes: ${hydrated.eject.blockingNodes.join(', ') || '(none)'}`,
          ),
        );
        console.log(
          chalk.dim(
            `  See ${path.join(runDir, 'eject.md')} — resume these locally with full tool access.`,
          ),
        );
      }

      if (!cfg) {
        console.log('');
        console.log(
          chalk.dim(
            '  tip: run `umbrella connect` to pair this machine with the web — future high-risk missions can then route here automatically.',
          ),
        );
      }

      console.log('');
      console.log(chalk.dim(`  open:  cd ${path.relative(process.cwd(), runDir) || '.'}`));
      console.log(chalk.dim(`  inspect:  less ${path.relative(process.cwd(), path.join(runDir, 'logs.txt'))}`));
    },
  );

program
  .command('serve')
  .description(
    'Run as a worker: long-poll the web, claim dispatched runs, execute them locally, and stream events back.',
  )
  .option('--from <url>', 'Web deployment to serve (overrides config + env)')
  .option('--interval <ms>', 'Heartbeat interval in ms (default 3000)', (v) =>
    parseInt(v, 10),
  )
  .option('--once', 'Drain pending work once and exit')
  .option('--max <n>', 'Stop after executing N runs (once-mode or loop)', (v) =>
    parseInt(v, 10),
  )
  .action(
    async (opts: { from?: string; interval?: number; once?: boolean; max?: number }) => {
      const cfg = loadNodeConfig();
      if (!cfg) {
        console.error(
          chalk.red(
            'not connected. run `umbrella connect` first to mint a node token.',
          ),
        );
        process.exitCode = 1;
        return;
      }

      const webUrl = resolveWebUrl(opts.from ?? null);
      const pollMs = Number.isFinite(opts.interval) ? opts.interval! : 3_000;

      console.log(chalk.green.bold('☂️  umbrella serve'));
      console.log(`   ${chalk.dim('node:    ')} ${cfg.nodeId}`);
      console.log(`   ${chalk.dim('web:     ')} ${webUrl}`);
      console.log(`   ${chalk.dim('interval:')} ${pollMs}ms`);
      if (opts.once) console.log(`   ${chalk.dim('mode:    ')} once`);
      if (opts.max) console.log(`   ${chalk.dim('max runs:')} ${opts.max}`);
      console.log('');
      console.log(chalk.dim('waiting for dispatched runs — Ctrl+C to stop.'));

      const abort = new AbortController();
      process.on('SIGINT', () => {
        console.log('\n' + chalk.dim('· shutting down'));
        abort.abort();
      });

      const stamp = () => chalk.dim(new Date().toISOString().slice(11, 19));
      const log = (line: string) => console.log(`${stamp()} ${line}`);

      if (opts.once) {
        try {
          const { executed } = await serveOnce({
            webUrl,
            onLog: log,
            signal: abort.signal,
            maxRuns: opts.max,
          });
          console.log('');
          console.log(chalk.dim(`· drained ${executed} run(s)`));
        } catch (err) {
          console.error(chalk.red(err instanceof Error ? err.message : String(err)));
          process.exitCode = 1;
        }
        return;
      }

      await serveLoop({
        webUrl,
        pollMs,
        onLog: log,
        signal: abort.signal,
        maxRuns: opts.max,
      });
    },
  );

program.parse();
