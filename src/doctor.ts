import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  readDaemonPid,
  isPidRunning,
  AGENT_PID_PATH,
} from '../modules/agent-runtime/core/agent-pid.js';
import { resolveLlmConfig } from '../modules/agent-runtime/core/llm.js';
import {
  dailyBudgetLimit,
  readTokenUsage,
} from '../modules/agent-runtime/core/token-budget.js';
import { getSession } from '../modules/agent-runtime/core/session-control.js';
import {
  resolveConfigPath,
  resolveDotEnvCandidates,
} from '../modules/agent-runtime/core/umbrella-config.js';
import { parseScheduleJsonFile } from '../modules/agent-runtime/core/schedule.js';

export async function runDoctor(): Promise<void> {
  console.log(chalk.cyan.bold('☂️ Umbrella doctor\n'));

  const node = process.version;
  const want = 18;
  const major = parseInt(node.slice(1).split('.')[0], 10);
  if (major >= want) {
    console.log(chalk.green(`Node ${node} (>=${want} OK)`));
  } else {
    console.log(chalk.red(`Node ${node} — need >= ${want}`));
  }

  const pid = await readDaemonPid();
  if (pid === null) {
    console.log(chalk.gray(`Agent PID file: none (${AGENT_PID_PATH})`));
  } else if (isPidRunning(pid)) {
    console.log(chalk.green(`Agent: running (pid ${pid})`));
  } else {
    console.log(chalk.yellow(`Agent: stale pid file (${pid} not running)`));
  }

  const cfgPath = resolveConfigPath();
  if (await fs.pathExists(cfgPath)) {
    console.log(chalk.green(`Config: ${cfgPath} (merged at agent start; existing env wins)`));
  } else {
    console.log(
      chalk.gray(
        `Config: none — ${cfgPath} (optional; see examples/config.json.example)`,
      ),
    );
  }

  const dotCandidates = resolveDotEnvCandidates();
  const dotExisting = (
    await Promise.all(dotCandidates.map((p) => fs.pathExists(p)))
  ).some(Boolean);
  if (dotExisting) {
    console.log(
      chalk.green(
        `.env: at least one candidate exists (${dotCandidates.join(' | ')}) — loaded at agent start before config.json`,
      ),
    );
  } else {
    console.log(
      chalk.gray(
        `.env: none of (${dotCandidates.join(', ')}) — optional; see examples/.env.example`,
      ),
    );
  }

  const db = path.join(os.homedir(), '.umbrella', 'memory.db');
  if (await fs.pathExists(db)) {
    console.log(chalk.green(`SQLite memory: ${db}`));
  } else {
    console.log(chalk.gray(`SQLite memory: not created yet (${db})`));
  }

  const llm = resolveLlmConfig();
  if (llm) {
    console.log(
      chalk.green(`LLM: configured (${llm.provider}, model ${llm.model})`),
    );
  } else {
    console.log(chalk.yellow('LLM: not configured (fallback plans only)'));
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log(chalk.green('Telegram: TELEGRAM_BOT_TOKEN set'));
  } else {
    console.log(chalk.gray('Telegram: not configured'));
  }

  if (process.env.DISCORD_BOT_TOKEN) {
    console.log(chalk.green('Discord: DISCORD_BOT_TOKEN set (!umb commands)'));
  } else {
    console.log(chalk.gray('Discord: not configured'));
  }

  const slackTriplet = [
    process.env.SLACK_BOT_TOKEN?.trim(),
    process.env.SLACK_APP_TOKEN?.trim(),
    process.env.SLACK_SIGNING_SECRET?.trim(),
  ];
  if (slackTriplet.every(Boolean)) {
    console.log(
      chalk.green(
        'Slack: SLACK_BOT_TOKEN + SLACK_APP_TOKEN + SLACK_SIGNING_SECRET set (Socket Mode, !umb)',
      ),
    );
  } else if (slackTriplet.some(Boolean)) {
    console.log(
      chalk.yellow(
        'Slack: partial env — need all three tokens for Socket Mode gateway',
      ),
    );
  } else {
    console.log(chalk.gray('Slack: not configured'));
  }

  const voiceStt = process.env.UMBRELLA_VOICE_STT?.trim();
  if (voiceStt) {
    const preview =
      voiceStt.length > 64 ? `${voiceStt.slice(0, 64)}…` : voiceStt;
    console.log(
      chalk.green(
        `Voice STT: UMBRELLA_VOICE_STT=${preview} (POST /api/voice-transcribe)`,
      ),
    );
  } else {
    console.log(chalk.gray('Voice STT: UMBRELLA_VOICE_STT unset (optional)'));
  }

  if (process.env.UMBRELLA_OPENAI_BASE_URL?.trim()) {
    console.log(
      chalk.cyan(
        `OpenAI-compatible base: ${process.env.UMBRELLA_OPENAI_BASE_URL} (model ${process.env.UMBRELLA_OLLAMA_MODEL || process.env.UMBRELLA_MODEL || 'llama3.2'})`,
      ),
    );
  }

  const sh = process.env.UMBRELLA_SECRETS_HELPER?.trim();
  if (sh) {
    const exists = await fs.pathExists(sh);
    console.log(
      exists
        ? chalk.cyan(`Secrets helper: ${sh} (runs at daemon start)`)
        : chalk.yellow(`Secrets helper path missing: ${sh}`),
    );
  }

  if (process.env.UMBRELLA_VERIFY_COMMAND) {
    console.log(
      chalk.green(`Verify hook: ${process.env.UMBRELLA_VERIFY_COMMAND}`),
    );
  }

  const budget = dailyBudgetLimit();
  if (budget) {
    const u = await readTokenUsage();
    console.log(
      chalk.cyan(
        `Token budget: ~${u.totalApproxTokens} / ${budget} today (UTC, approximate)`,
      ),
    );
  } else {
    console.log(chalk.gray('Token budget: unset (set UMBRELLA_TOKEN_BUDGET_DAILY)'));
  }

  const sess = await getSession();
  if (sess) {
    console.log(
      chalk.gray(
        `Session: ${sess.sessionId} · heartbeats ${sess.heartbeats} · umbrella session reset`,
      ),
    );
  } else {
    console.log(chalk.gray('Session: no session.json yet (starts on first heartbeat)'));
  }

  try {
    const sched = await parseScheduleJsonFile();
    if (sched.length > 0) {
      console.log(
        chalk.cyan(
          `schedule.json: ${sched.length} entr(y/ies) — synced to SQLite on next agent start (GET /api/schedules)`,
        ),
      );
    } else {
      console.log(
        chalk.gray(
          'schedule.json: none (or missing) — umbrella_schedules empty until you add ~/.umbrella/schedule.json',
        ),
      );
    }
  } catch {
    console.log(chalk.gray('schedule.json: could not read'));
  }

  if (process.env.UMBRELLA_SHIPPING_ROOT) {
    const agentScaffold =
      process.env.UMBRELLA_AGENT_SCAFFOLD === '0' ||
      process.env.UMBRELLA_AGENT_SCAFFOLD === 'false'
        ? 'agent scaffold-cli: off (UMBRELLA_AGENT_SCAFFOLD)'
        : 'agent scaffold-cli: allowed';
    console.log(
      chalk.cyan(
        `Shipping root: ${process.env.UMBRELLA_SHIPPING_ROOT} (${agentScaffold}; see examples/SHIPPING.md)`,
      ),
    );
  } else {
    console.log(
      chalk.gray(
        'Shipping: UMBRELLA_SHIPPING_ROOT unset — optional; scaffold CLIs with umbrella scaffold cli (examples/SHIPPING.md)',
      ),
    );
  }

  console.log(chalk.gray('\nOptional: ~/.umbrella/llm-audit.log (disable with UMBRELLA_LLM_AUDIT=0)'));
}
