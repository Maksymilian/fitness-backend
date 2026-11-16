import type { Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { Bot } from 'grammy';
import type { InlineKeyboardMarkup, Update, UserFromGetMe } from 'grammy/types';
import { TelegramBot } from '../../src/platform/telegram/telegram-bot.js';
import { TelegramChats } from '../../src/platform/telegram/telegram-chats.js';

/** A call the bot made to Telegram's Bot API. */
export interface TelegramCall {
  method: string;
  payload: Record<string, unknown>;
}

const BOT_INFO = { id: 42, is_bot: true, first_name: 'Fitness', username: 'fitness_test_bot' } as UserFromGetMe;

export const TELEGRAM_WEBHOOK_SECRET = 'test-secret-token-of-at-least-32-characters';

/** The configuration of a bot that receives its updates by webhook: nothing polls Telegram. */
export function webhookConfig(): ConfigService {
  return new ConfigService({
    TELEGRAM_UPDATES: 'webhook',
    TELEGRAM_WEBHOOK_URL: 'https://progress.fitness.test/telegram/updates',
    TELEGRAM_WEBHOOK_SECRET,
  });
}

/**
 * A grammY bot whose Bot API calls are recorded instead of sent. Every call succeeds, except the
 * methods in `refuse`, which Telegram answers with that description.
 */
export function recordingBot() {
  const bot = new Bot('42:test-token', { botInfo: BOT_INFO });
  const calls: TelegramCall[] = [];
  const refuse = new Map<string, string>();
  bot.api.config.use(async (_previous, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    const description = refuse.get(method);
    return (description ? { ok: false, error_code: 400, description } : { ok: true, result: true }) as never;
  });
  return { bot, calls, refuse };
}

/** What the bot wrote: the text of every message it sent or edited, oldest first. */
export function texts(calls: TelegramCall[]): string[] {
  return calls.filter(({ method }) => method === 'sendMessage' || method === 'editMessageText').map(({ payload }) => String(payload.text));
}

/** The buttons of the last message the bot sent or edited. */
export function buttons(calls: TelegramCall[]): Array<{ text: string; callback_data: string }> {
  const last = calls.filter(({ method }) => method === 'sendMessage' || method === 'editMessageText').at(-1);
  const markup = last?.payload.reply_markup as InlineKeyboardMarkup | undefined;
  return (markup?.inline_keyboard.flat() ?? []) as Array<{ text: string; callback_data: string }>;
}

/** Which member each chat is signed in as, in memory. */
export class InMemoryTelegramChats {
  readonly members = new Map<number, string>();

  async memberOf(chatId: number): Promise<string | null> {
    return this.members.get(chatId) ?? null;
  }

  async signIn(chatId: number, memberId: string): Promise<void> {
    this.members.set(chatId, memberId);
  }

  async signOut(chatId: number): Promise<void> {
    this.members.delete(chatId);
  }
}

let lastUpdateId = 1000;

/** A text message in a chat, a bot command when it starts with `/`. */
export function textMessage(chatId: number, text: string, options: { updateId?: number; chatType?: 'private' | 'group' } = {}): Update {
  const updateId = options.updateId ?? ++lastUpdateId;
  const command = text.startsWith('/') ? text.split(' ')[0] : null;
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: options.chatType === 'group' ? { id: chatId, type: 'group', title: 'Cyclists' } : { id: chatId, type: 'private', first_name: 'Ada' },
      from: { id: chatId, is_bot: false, first_name: 'Ada' },
      text,
      ...(command ? { entities: [{ type: 'bot_command', offset: 0, length: command.length }] } : {}),
    },
  };
}

/** A press on a button of a message the bot sent to a private chat. */
export function buttonPress(chatId: number, data: string, options: { updateId?: number } = {}): Update {
  const updateId = options.updateId ?? ++lastUpdateId;
  return {
    update_id: updateId,
    callback_query: {
      id: `query-${updateId}`,
      chat_instance: 'test',
      data,
      from: { id: chatId, is_bot: false, first_name: 'Ada' },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'private', first_name: 'Ada' }, text: 'An earlier message' },
    },
  };
}

/**
 * A context module's bot commands on a `TelegramBot` whose API calls are recorded, with fake
 * buses. Chat `7` is signed in as ada@example.com.
 */
export async function botCommands(commands: Type, buses: { queryBus?: Partial<QueryBus>; commandBus?: Partial<CommandBus> }) {
  const { bot, calls } = recordingBot();
  const chats = new InMemoryTelegramChats();
  await chats.signIn(7, 'ada@example.com');
  const moduleRef = await Test.createTestingModule({
    providers: [
      commands,
      TelegramBot,
      { provide: Bot, useValue: bot },
      { provide: TelegramChats, useValue: chats },
      { provide: ConfigService, useValue: webhookConfig() },
      { provide: QueryBus, useValue: buses.queryBus ?? {} },
      { provide: CommandBus, useValue: buses.commandBus ?? {} },
    ],
  }).compile();
  await moduleRef.init();
  const telegramBot = moduleRef.get(TelegramBot);
  return {
    calls,
    /** Hands the update to the bot, as the webhook does, and returns what the bot sent for it. */
    async send(update: Update): Promise<TelegramCall[]> {
      const before = calls.length;
      await telegramBot.handle(update);
      return calls.slice(before);
    },
    close: () => moduleRef.close(),
  };
}
