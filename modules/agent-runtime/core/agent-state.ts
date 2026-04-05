import { memory } from './memory.js';

export const AGENT_STATE_KEYS = {
  coreGoal: 'core_goal',
  foregroundGoal: 'foreground_goal',
  backgroundPaused: 'background_paused',
  telegramLastChatId: 'telegram_last_chat_id',
  discordLastChannelId: 'discord_last_channel_id',
  slackLastChannelId: 'slack_last_channel_id',
} as const;

export type AgentGoalSnapshot = {
  coreGoal: string | null;
  foregroundGoal: string | null;
  backgroundPaused: boolean;
  telegramLastChatId: string | null;
  discordLastChannelId: string | null;
  slackLastChannelId: string | null;
};

export async function getAgentGoalSnapshot(): Promise<AgentGoalSnapshot> {
  const [core, fg, bp, chat, dch, sch] = await Promise.all([
    memory.getAgentState(AGENT_STATE_KEYS.coreGoal),
    memory.getAgentState(AGENT_STATE_KEYS.foregroundGoal),
    memory.getAgentState(AGENT_STATE_KEYS.backgroundPaused),
    memory.getAgentState(AGENT_STATE_KEYS.telegramLastChatId),
    memory.getAgentState(AGENT_STATE_KEYS.discordLastChannelId),
    memory.getAgentState(AGENT_STATE_KEYS.slackLastChannelId),
  ]);
  return {
    coreGoal: core?.trim() ? core.trim() : null,
    foregroundGoal: fg?.trim() ? fg.trim() : null,
    backgroundPaused: bp === '1' || bp === 'true',
    telegramLastChatId: chat?.trim() ? chat.trim() : null,
    discordLastChannelId: dch?.trim() ? dch.trim() : null,
    slackLastChannelId: sch?.trim() ? sch.trim() : null,
  };
}

export async function setCoreGoal(goal: string): Promise<void> {
  const g = goal.trim();
  if (!g) {
    await memory.deleteAgentState(AGENT_STATE_KEYS.coreGoal);
    return;
  }
  await memory.setAgentState(AGENT_STATE_KEYS.coreGoal, g);
}

export async function setForegroundGoal(goal: string): Promise<void> {
  const g = goal.trim();
  if (!g) {
    await clearForegroundGoal();
    return;
  }
  await memory.setAgentState(AGENT_STATE_KEYS.foregroundGoal, g);
}

export async function clearForegroundGoal(): Promise<void> {
  await memory.deleteAgentState(AGENT_STATE_KEYS.foregroundGoal);
}

export async function setBackgroundPaused(paused: boolean): Promise<void> {
  if (paused) {
    await memory.setAgentState(AGENT_STATE_KEYS.backgroundPaused, '1');
  } else {
    await memory.deleteAgentState(AGENT_STATE_KEYS.backgroundPaused);
  }
}

export async function setTelegramLastChatId(chatId: number): Promise<void> {
  await memory.setAgentState(
    AGENT_STATE_KEYS.telegramLastChatId,
    String(chatId),
  );
}

export async function setDiscordLastChannelId(channelId: string): Promise<void> {
  await memory.setAgentState(
    AGENT_STATE_KEYS.discordLastChannelId,
    channelId,
  );
}

export async function setSlackLastChannelId(channelId: string): Promise<void> {
  await memory.setAgentState(
    AGENT_STATE_KEYS.slackLastChannelId,
    channelId,
  );
}

/** When verifier passes, drop foreground and return to core background loop. */
export function foregroundClearsOnVerifySuccess(): boolean {
  const v = process.env.UMBRELLA_FOREGROUND_CLEAR_ON_VERIFY?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}
