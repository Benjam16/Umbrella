import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
} from 'discord.js';
import {
  getAgentGoalSnapshot,
  setDiscordLastChannelId,
} from '../core/agent-state.js';
import { handleUmbrellaChatCommand } from './umb-commands.js';
import chalk from 'chalk';

export class DiscordGateway {
  private client: Client;

  constructor(token: string) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this.client.once(Events.ClientReady, (c) => {
      console.log(chalk.green(`☂️ Discord gateway ready as ${c.user?.tag}`));
    });

    this.client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      const content = message.content.trim();
      if (!content.toLowerCase().startsWith('!umb')) return;
      console.log(chalk.blue(`[Discord] ${content.slice(0, 120)}`));
      try {
        await setDiscordLastChannelId(message.channelId);
        const rest = content.replace(/^!umb\s*/i, '').trim();
        const reply = await handleUmbrellaChatCommand(rest);
        const chunks = reply.match(/[\s\S]{1,1900}/g) ?? [reply];
        for (const part of chunks) {
          await message.reply({ content: part });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          await message.reply(`❌ ${msg.slice(0, 1800)}`);
        } catch {
          /* ignore */
        }
      }
    });

    this.client.login(token).catch((err) => {
      console.error(chalk.red('Discord login error'), err);
    });
    console.log(chalk.green('☂️ Discord gateway connecting…'));
  }

  async notifyLastChannel(text: string): Promise<void> {
    const snap = await getAgentGoalSnapshot();
    if (!snap.discordLastChannelId) return;
    const body = text.slice(0, 1900);
    try {
      const ch = await this.client.channels.fetch(snap.discordLastChannelId);
      if (ch && ch.isTextBased() && 'send' in ch) {
        await ch.send(body);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(chalk.yellow(`Discord notify failed: ${msg}`));
    }
  }
}
