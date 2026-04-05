import { App } from '@slack/bolt';
import {
  getAgentGoalSnapshot,
  setSlackLastChannelId,
} from '../core/agent-state.js';
import { handleUmbrellaChatCommand } from './umb-commands.js';
import chalk from 'chalk';

export type SlackGatewayOptions = {
  botToken: string;
  appToken: string;
  signingSecret: string;
};

export class SlackGateway {
  private readonly app: App;

  constructor(opts: SlackGatewayOptions) {
    this.app = new App({
      token: opts.botToken,
      signingSecret: opts.signingSecret,
      socketMode: true,
      appToken: opts.appToken,
    });

    this.app.message(async ({ message, say }) => {
      if (!('text' in message) || typeof message.text !== 'string') return;
      if ('bot_id' in message && message.bot_id) return;
      if (message.subtype === 'bot_message') return;

      const content = message.text.trim();
      if (!content.toLowerCase().startsWith('!umb')) return;

      console.log(chalk.blue(`[Slack] ${content.slice(0, 120)}`));
      try {
        await setSlackLastChannelId(message.channel);
        const rest = content.replace(/^!umb\s*/i, '').trim();
        const reply = await handleUmbrellaChatCommand(rest);
        const chunks = reply.match(/[\s\S]{1,3500}/g) ?? [reply];
        for (const part of chunks) {
          await say(part);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        try {
          await say(`❌ ${msg.slice(0, 3400)}`);
        } catch {
          /* ignore */
        }
      }
    });
  }

  async start(): Promise<void> {
    await this.app.start();
    console.log(chalk.green('☂️ Slack gateway ready (Socket Mode, !umb …)'));
  }

  async stop(): Promise<void> {
    await this.app.stop();
  }

  async notifyLastChannel(text: string): Promise<void> {
    const snap = await getAgentGoalSnapshot();
    if (!snap.slackLastChannelId) return;
    const body = text.slice(0, 3500);
    try {
      await this.app.client.chat.postMessage({
        channel: snap.slackLastChannelId,
        text: body,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(chalk.yellow(`Slack notify failed: ${msg}`));
    }
  }
}
