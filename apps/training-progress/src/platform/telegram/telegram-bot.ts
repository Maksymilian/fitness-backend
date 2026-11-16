import { DomainError } from '@app/ddd';
import { inInterface, inRoundtrip } from '@app/telemetry';
import { type BeforeApplicationShutdown, Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, BotError, type CommandContext, Composer, type Context, type Filter, GrammyError, HttpError } from 'grammy';
import type { BotCommand, Update } from 'grammy/types';
import type { Environment } from '../config/environment.js';
import { TelegramChats } from './telegram-chats.js';

/** A button press: its callback data is `<prefix>` or `<prefix>:<data>`, at most 64 bytes. */
export type ButtonContext = Filter<Context, 'callback_query:data'>;

/** A bot command for a signed-in chat, with the member id the chat is signed in as. */
export type MemberCommand = (ctx: CommandContext<Context>, memberId: string) => Promise<unknown>;

/** A button for a signed-in chat, with the callback data after `<prefix>:` and the member id. */
export type MemberButton = (ctx: ButtonContext, data: string, memberId: string) => Promise<unknown>;

/** The updates the bot handles; Telegram doesn't send the others. */
const ALLOWED_UPDATES = ['message', 'callback_query'] as const;

const NOT_SIGNED_IN = 'Sign in first: send /sign_in followed by your email address, for example\n/sign_in ada@example.com';

/**
 * grammY's `Bot` for TELEGRAM_BOT_TOKEN, or `null` when the bot is off. A provider of its own, so
 * tests replace it with a bot whose API calls are recorded instead of sent.
 */
export const telegramBotProvider = {
  provide: Bot,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Environment, true>): Bot | null => {
    const token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    return token ? new Bot(token) : null;
  },
};

/**
 * The Telegram bot: the chat interface of Training Progress. Context modules register their bot
 * commands and buttons here while the application initializes; every one but the sign-in commands
 * needs a signed-in chat, and only private chats are answered.
 *
 * A domain error becomes a reply (an alert, for a button). A refused or failed Telegram call is
 * logged: handling the update again wouldn't help. Anything else fails the update, so Telegram
 * sends it again (webhook) once, say, the database is back.
 */
@Injectable()
export class TelegramBot implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(TelegramBot.name);
  private readonly handlers = new Composer<Context>();
  private readonly memberCommands: BotCommand[] = [];
  private readonly signInCommands: BotCommand[] = [];

  constructor(
    @Inject(Bot) private readonly bot: Bot | null,
    private readonly config: ConfigService<Environment, true>,
    private readonly chats: TelegramChats,
  ) {}

  /** Registers a bot command for signed-in chats, listed in the chat's menu with its description. */
  command(name: string, description: string, handle: MemberCommand): void {
    this.memberCommands.push({ command: name, description });
    this.handlers.command(name, (ctx) =>
      this.guard(ctx, async () => {
        const memberId = await this.memberOf(ctx);
        await (memberId ? handle(ctx, memberId) : ctx.reply(NOT_SIGNED_IN));
      }),
    );
  }

  /** Registers a button for signed-in chats: callback data `<prefix>` or `<prefix>:<data>`. */
  button(prefix: string, handle: MemberButton): void {
    this.handlers.on('callback_query:data', async (ctx, next) => {
      const { data } = ctx.callbackQuery;
      if (data !== prefix && !data.startsWith(`${prefix}:`)) {
        return next();
      }
      await this.guard(ctx, async () => {
        const memberId = await this.memberOf(ctx);
        if (!memberId) {
          await ctx.answerCallbackQuery({ text: NOT_SIGNED_IN, show_alert: true });
          return;
        }
        await handle(ctx, data.slice(prefix.length + 1), memberId);
        await ctx.answerCallbackQuery();
      });
    });
  }

  /** Registers a command that works without signing in: `/start`, `/sign_in`, `/sign_out`. */
  signInCommand(name: string, description: string | null, handle: (ctx: CommandContext<Context>) => Promise<unknown>): void {
    if (description) {
      this.signInCommands.push({ command: name, description });
    }
    this.handlers.command(name, (ctx) => this.guard(ctx, () => handle(ctx)));
  }

  /** The bot commands, one per line, as the chat's menu lists them. */
  help(): string {
    return this.menu()
      .map(({ command, description }) => `/${command} – ${description}`)
      .join('\n');
  }

  /** Handles an update from the webhook. Rejects when the update should be sent again. */
  async handle(update: Update): Promise<void> {
    if (!this.bot) {
      throw new Error('The Telegram bot is off: no TELEGRAM_BOT_TOKEN');
    }
    try {
      await this.bot.handleUpdate(update);
    } catch (error) {
      throw error instanceof BotError ? error.error : error;
    }
  }

  onApplicationBootstrap(): void {
    if (!this.bot) {
      this.logger.log('Telegram bot off: no TELEGRAM_BOT_TOKEN');
      return;
    }
    // Every update is a roundtrip of its own in the traces, with its flow and the `telegram`
    // interface: long polling has no HTTP request to start one. Its type and id only: the chat
    // identifies a person.
    this.bot.use((ctx, next) => {
      const type = ALLOWED_UPDATES.find((kind) => kind in ctx.update) ?? 'update';
      return inRoundtrip(`telegram ${type}`, { 'telegram.update.id': ctx.update.update_id, 'telegram.update.type': type }, () => inInterface('telegram', next));
    });
    const privateChats = this.bot.chatType('private');
    privateChats.use(this.handlers);
    // A button this version no longer has: stop its spinner.
    privateChats.on('callback_query', (ctx) => this.guard(ctx, () => ctx.answerCallbackQuery()));
    privateChats.on('message', (ctx) => this.guard(ctx, () => ctx.reply(`I know these commands:\n${this.help()}`)));
    // Polling only: the webhook rejects instead, so Telegram sends the update again.
    this.bot.catch(({ error }) => this.logger.error(`Telegram update failed: ${String(error)}`));
    // In the background: the service serves GraphQL even while Telegram is unreachable.
    void this.connect(this.bot);
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.bot?.isRunning()) {
      await this.bot.stop();
    }
  }

  private memberOf(ctx: Context): Promise<string | null> {
    return ctx.chatId === undefined ? Promise.resolve(null) : this.chats.memberOf(ctx.chatId);
  }

  private menu(): BotCommand[] {
    return [...this.memberCommands, ...this.signInCommands];
  }

  private async connect(bot: Bot): Promise<void> {
    try {
      await bot.init();
      await bot.api.setMyCommands(this.menu(), { scope: { type: 'all_private_chats' } });
      if (this.config.get('TELEGRAM_UPDATES', { infer: true }) === 'webhook') {
        // validateEnvironment() requires TELEGRAM_WEBHOOK_URL when TELEGRAM_UPDATES is webhook.
        await bot.api.setWebhook(this.config.get('TELEGRAM_WEBHOOK_URL', { infer: true })!, {
          secret_token: this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }),
          allowed_updates: ALLOWED_UPDATES,
        });
        this.logger.log(`Telegram bot @${bot.botInfo.username}: updates by webhook`);
        return;
      }
      // Removes the webhook, then asks Telegram for updates until the application stops.
      bot
        .start({ allowed_updates: ALLOWED_UPDATES, onStart: () => this.logger.log(`Telegram bot @${bot.botInfo.username}: updates by polling`) })
        .catch((error: unknown) => this.logger.error(`Telegram polling stopped: ${String(error)}`));
    } catch (error) {
      this.logger.error(`Telegram bot not connected: ${String(error)}`);
    }
  }

  private async guard(ctx: Context, work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
    } catch (error) {
      if (error instanceof DomainError) {
        await this.guard(ctx, () => (ctx.callbackQuery ? ctx.answerCallbackQuery({ text: error.message, show_alert: true }) : ctx.reply(error.message)));
        return;
      }
      if (error instanceof GrammyError || error instanceof HttpError) {
        // Pressing the button that's already selected edits nothing, which Telegram refuses.
        if (!(error instanceof GrammyError && error.description.includes('message is not modified'))) {
          this.logger.warn(`Telegram call failed: ${error.message}`);
        }
        return;
      }
      throw error;
    }
  }
}
