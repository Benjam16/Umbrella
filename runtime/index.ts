import { CronJob } from 'cron';
import { memory } from '../modules/agent-runtime/core/memory.js';
import { planner } from '../modules/agent-runtime/core/planner.js';
import { executor } from '../modules/agent-runtime/core/executor.js';
import { verifier } from '../modules/agent-runtime/core/verifier.js';
import { learnFromVerification } from '../modules/agent-runtime/core/learner.js';
import { DEFAULT_HEARTBEAT_MS } from '../modules/agent-runtime/core/heartbeat.js';
import { TelegramGateway } from '../modules/agent-runtime/gateway/telegram.js';
import { DiscordGateway } from '../modules/agent-runtime/gateway/discord.js';
import { SlackGateway } from '../modules/agent-runtime/gateway/slack.js';
import { startDashboardApi } from '../modules/agent-runtime/gateway/api.js';
import {
  ensureNoOtherDaemon,
  writeDaemonPidFile,
  syncRemoveDaemonPidFile,
} from '../modules/agent-runtime/core/agent-pid.js';
import { stuckDetector } from '../modules/agent-runtime/core/stuck-detector.js';
import { touchHeartbeat } from '../modules/agent-runtime/core/session-control.js';
import { initMcp, shutdownMcp } from '../modules/agent-runtime/mcp/client-manager.js';
import {
  drainSkillCandidatesToPending,
  promoteApprovedSkills,
} from '../modules/agent-runtime/core/skill-promotion.js';
import { appendRunLog, readLastRun } from '../modules/agent-runtime/core/run-log.js';
import { loadScheduleEntries } from '../modules/agent-runtime/core/schedule.js';
import { pickHeartbeatGoal } from '../modules/agent-runtime/core/heartbeat-goal.js';
import {
  clearForegroundGoal,
  foregroundClearsOnVerifySuccess,
} from '../modules/agent-runtime/core/agent-state.js';
import {
  applyConfigFromDisk,
  loadDotEnvFiles,
} from '../modules/agent-runtime/core/umbrella-config.js';
import { applySecretsFromHelper } from '../modules/agent-runtime/core/secrets-helper.js';
import { maybeMemoryLlmCompact } from '../modules/agent-runtime/core/memory-llm-compact.js';
import chalk from 'chalk';

async function start(): Promise<void> {
  const daemonStartedAt = Date.now();

  const dot = loadDotEnvFiles();
  if (dot.loadedPaths.length > 0) {
    console.log(
      chalk.dim(`☂️ Loaded ${dot.loadedPaths.length} .env file(s): ${dot.loadedPaths.join(', ')}`),
    );
  }

  const sec = applySecretsFromHelper();
  if (sec.error) {
    console.log(chalk.yellow(`☂️ UMBRELLA_SECRETS_HELPER failed: ${sec.error}`));
  } else if (sec.applied && sec.helperPath) {
    console.log(
      chalk.dim(
        `☂️ Secrets helper merged ${sec.applied} empty env key(s) from ${sec.helperPath}`,
      ),
    );
  }

  const cfg = applyConfigFromDisk();
  if (cfg.invalid) {
    console.log(
      chalk.yellow(`☂️ Config file invalid or unreadable: ${cfg.path} (continuing with env only)`),
    );
  } else if (cfg.loaded && cfg.appliedKeys.length > 0) {
    console.log(
      chalk.dim(
        `☂️ Applied ${cfg.appliedKeys.length} env key(s) from ${cfg.path}`,
      ),
    );
  }

  await memory.init();
  await ensureNoOtherDaemon();
  await writeDaemonPidFile(process.pid);
  await initMcp();

  let slackGateway: SlackGateway | null = null;

  const cleanupPid = (): void => syncRemoveDaemonPidFile();
  const shutdown = async (): Promise<void> => {
    if (slackGateway) {
      try {
        await slackGateway.stop();
      } catch {
        /* ignore */
      }
      slackGateway = null;
    }
    await shutdownMcp();
    cleanupPid();
  };
  process.on('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  const dashPortRaw = process.env.UMBRELLA_DASHBOARD_PORT;
  if (dashPortRaw) {
    const p = Number(dashPortRaw);
    if (Number.isFinite(p) && p > 0 && p < 65536) {
      startDashboardApi(p, { startedAt: daemonStartedAt });
    } else {
      console.log(chalk.yellow(`Invalid UMBRELLA_DASHBOARD_PORT: ${dashPortRaw}`));
    }
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  let telegramGateway: TelegramGateway | null = null;
  if (token) {
    telegramGateway = new TelegramGateway(token);
  }

  const discordToken = process.env.DISCORD_BOT_TOKEN?.trim();
  let discordGateway: DiscordGateway | null = null;
  if (discordToken) {
    discordGateway = new DiscordGateway(discordToken);
  }

  const slackBot = process.env.SLACK_BOT_TOKEN?.trim();
  const slackApp = process.env.SLACK_APP_TOKEN?.trim();
  const slackSigning = process.env.SLACK_SIGNING_SECRET?.trim();
  if (slackBot && slackApp && slackSigning) {
    slackGateway = new SlackGateway({
      botToken: slackBot,
      appToken: slackApp,
      signingSecret: slackSigning,
    });
    void slackGateway.start().catch((err) => {
      console.error(chalk.red('Slack gateway start error'), err);
    });
  } else if (slackBot || slackApp || slackSigning) {
    console.log(
      chalk.yellow(
        'Slack: set all of SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET for Socket Mode (!umb).',
      ),
    );
  }

  if (!token && !discordToken && !slackGateway) {
    console.log(
      chalk.yellow(
        'No TELEGRAM_BOT_TOKEN, DISCORD_BOT_TOKEN, or full Slack trio — chat gateways off (heartbeat only).',
      ),
    );
  }

  const digestEvery = (() => {
    const a = parseInt(process.env.UMBRELLA_DIGEST_HEARTBEATS?.trim() || '', 10);
    if (Number.isFinite(a) && a > 0) return a;
    const b = parseInt(
      process.env.UMBRELLA_TELEGRAM_DIGEST_HEARTBEATS?.trim() || '0',
      10,
    );
    return Number.isFinite(b) && b > 0 ? b : 0;
  })();
  let digestHeartbeatCount = 0;

  const intervalMs = DEFAULT_HEARTBEAT_MS();

  let escalationGoal: string | null = null;
  const scheduledGoalQueue: string[] = [];

  const scheduleEntries = await loadScheduleEntries();
  if (scheduleEntries.length > 0) {
    console.log(
      chalk.dim(`☂️ Schedules synced to SQLite: ${scheduleEntries.length} row(s) (GET /api/schedules)`),
    );
  }
  const cronJobs: CronJob[] = [];
  for (let i = 0; i < scheduleEntries.length; i++) {
    const e = scheduleEntries[i];
    if (e.kind === 'interval') {
      console.log(
        chalk.cyan(
          `☂️ Schedule[${i}] interval ${e.intervalMs} ms → "${e.goal.slice(0, 80)}${e.goal.length > 80 ? '…' : ''}"`,
        ),
      );
      setInterval(() => {
        scheduledGoalQueue.push(e.goal);
      }, e.intervalMs);
    } else {
      try {
        const job = new CronJob(
          e.cron,
          () => {
            scheduledGoalQueue.push(e.goal);
          },
          null,
          true,
          e.timezone,
        );
        cronJobs.push(job);
        console.log(
          chalk.cyan(
            `☂️ Schedule[${i}] cron "${e.cron}"${e.timezone ? ` (${e.timezone})` : ''} → "${e.goal.slice(0, 60)}…"`,
          ),
        );
      } catch (err) {
        console.log(
          chalk.yellow(
            `☂️ Schedule[${i}] invalid cron "${e.cron}": ${err instanceof Error ? err.message : err}`,
          ),
        );
      }
    }
  }

  let heartbeatCount = 0;

  async function heartbeatOnce(): Promise<void> {
    heartbeatCount += 1;
    console.log(chalk.yellow('☂️ Heartbeat — planner → executor → verifier'));

    const sched = scheduledGoalQueue.shift() ?? null;

    const esc = escalationGoal;
    if (esc) {
      escalationGoal = null;
    }

    const pick = await pickHeartbeatGoal({ scheduled: sched, escalation: esc });
    const goal = pick.goal;

    if (pick.source === 'scheduled') {
      console.log(chalk.magenta('☂️ Orchestrator: scheduled goal this cycle'));
    } else if (pick.source === 'escalation') {
      console.log(chalk.magenta('☂️ Orchestrator: escalation goal this cycle'));
    } else if (pick.source === 'foreground') {
      console.log(chalk.magenta('☂️ Orchestrator: foreground task (interrupt)'));
    } else if (pick.source === 'core') {
      console.log(chalk.cyan('☂️ Orchestrator: core background goal'));
    } else if (pick.source === 'paused_idle') {
      console.log(chalk.gray('☂️ Orchestrator: background paused — idle tick'));
    }

    await touchHeartbeat(goal);

    let verifyOk: boolean | null = null;
    let promotedSkills = 0;
    let pendingSkillsCreated = 0;
    let planXml = '';
    let taskCount = 0;
    let executionPreview: string | undefined;

    if (pick.skipPlannerExecutor) {
      verifyOk = null;
    } else {
      planXml = await planner.createPlan(goal);
      taskCount = (planXml.match(/<task>/g) || []).length;
      await executor.run(planXml);

      const lastResult = await memory.recall('execution_result', 1);
      if (lastResult.length) {
        executionPreview = lastResult[0].content.slice(0, 2000);
        verifyOk = await verifier.verify(lastResult[0].content);
        await learnFromVerification(verifyOk, lastResult[0].content);
        const nextEscalation = await stuckDetector.onVerification(
          verifyOk,
          lastResult[0].content,
        );
        if (nextEscalation) escalationGoal = nextEscalation;

        if (
          verifyOk &&
          pick.source === 'foreground' &&
          foregroundClearsOnVerifySuccess()
        ) {
          await clearForegroundGoal();
          console.log(
            chalk.green('☂️ Foreground task cleared after successful verify'),
          );
        }
      }

      pendingSkillsCreated = await drainSkillCandidatesToPending();
      promotedSkills = await promoteApprovedSkills();
      if (pendingSkillsCreated || promotedSkills) {
        console.log(
          chalk.cyan(
            `☂️ Skills: +${pendingSkillsCreated} pending proposal(s), ${promotedSkills} promoted`,
          ),
        );
      }
    }

    await appendRunLog({
      t: new Date().toISOString(),
      goal,
      goalSource: pick.source,
      skipped: pick.skipPlannerExecutor,
      verifyOk,
      promotedSkills,
      pendingSkillsCreated,
      planPreview: pick.skipPlannerExecutor ? undefined : planXml.slice(0, 2500),
      taskCount: pick.skipPlannerExecutor ? undefined : taskCount,
      executionPreview,
    });

    const scheduleNotifyOn =
      process.env.UMBRELLA_SCHEDULE_NOTIFY === '1' ||
      process.env.UMBRELLA_SCHEDULE_NOTIFY === 'true';
    if (
      pick.source === 'scheduled' &&
      scheduleNotifyOn &&
      (telegramGateway || discordGateway || slackGateway)
    ) {
      const msg = [
        '☂️ Scheduled heartbeat finished',
        `verify: ${String(verifyOk)}`,
        `goal: ${goal.slice(0, 500)}${goal.length > 500 ? '…' : ''}`,
      ].join('\n');
      if (telegramGateway) await telegramGateway.notifyLastChat(msg);
      if (discordGateway) await discordGateway.notifyLastChannel(msg);
      if (slackGateway) await slackGateway.notifyLastChannel(msg);
    }

    try {
      await maybeMemoryLlmCompact(heartbeatCount);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(chalk.yellow(`☂️ Memory LLM compact skipped: ${msg}`));
    }

    if (digestEvery > 0) {
      digestHeartbeatCount += 1;
      if (digestHeartbeatCount % digestEvery === 0) {
        const last = await readLastRun();
        const msg = [
          '☂️ Digest',
          last
            ? `Last [${last.goalSource ?? '?'}] verify=${String(last.verifyOk)} skipped=${String(last.skipped ?? false)}`
            : '',
          last?.goal ? `Goal: ${last.goal.slice(0, 220)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        if (telegramGateway) await telegramGateway.notifyLastChat(msg);
        if (discordGateway) await discordGateway.notifyLastChannel(msg);
        if (slackGateway) await slackGateway.notifyLastChannel(msg);
      }
    }

    await memory.autoSummarize();
    console.log(chalk.green('☂️ Heartbeat cycle complete'));
  }

  void heartbeatOnce().catch((err) =>
    console.error(chalk.red('Heartbeat error'), err),
  );

  setInterval(() => {
    void heartbeatOnce().catch((err) =>
      console.error(chalk.red('Heartbeat error'), err),
    );
  }, intervalMs);

  console.log(
    chalk.green.bold(
      `☂️ Umbrella Agent Daemon running (heartbeat every ${intervalMs} ms)`,
    ),
  );
}

start().catch(console.error);
