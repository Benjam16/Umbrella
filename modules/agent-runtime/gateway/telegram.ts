import { Telegraf } from 'telegraf';
import {
  getAgentGoalSnapshot,
  setTelegramLastChatId,
} from '../core/agent-state.js';
import { handleUmbrellaChatCommand } from './umb-commands.js';
import chalk from 'chalk';

export class TelegramGateway {
  private bot: Telegraf;

  constructor(token: string) {
    this.bot = new Telegraf(token);

    this.bot.start((ctx) =>
      ctx.reply(
        '☂️ Umbrella online.\nTry: /umb help',
      ),
    );

    this.bot.command('umb', async (ctx) => {
      const text = 'text' in ctx.message ? ctx.message.text : '';
      const chatId = ctx.chat?.id;
      console.log(chalk.blue(`[Telegram] ${text}`));
      try {
        if (chatId !== undefined) {
          await setTelegramLastChatId(chatId);
        }
        const rest = text.replace(/^\/umb\s*/i, '').trim();
        const response = await handleUmbrellaChatCommand(rest);
        await ctx.reply(response);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        await ctx.reply(`❌ ${message}`);
      }
    });

    this.bot.launch().catch((err) => console.error(chalk.red('Telegram launch error'), err));
    console.log(chalk.green('☂️ Telegram gateway starting (async launch)'));
  }

  /** Optional digest to last chat that used /umb (see UMBRELLA_TELEGRAM_DIGEST_HEARTBEATS). */
  async notifyLastChat(text: string): Promise<void> {
    const snap = await getAgentGoalSnapshot();
    if (!snap.telegramLastChatId) return;
    const body = text.slice(0, 3900);
    try {
      await this.bot.telegram.sendMessage(snap.telegramLastChatId, body);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(chalk.yellow(`Telegram notify failed: ${msg}`));
    }
  }
}
