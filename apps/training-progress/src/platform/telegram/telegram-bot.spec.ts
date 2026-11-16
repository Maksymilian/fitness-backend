import { DomainError } from '@app/ddd';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Bot } from 'grammy';
import { buttonPress, InMemoryTelegramChats, recordingBot, texts, textMessage, webhookConfig } from '../../../test/support/telegram.js';
import { TelegramBot } from './telegram-bot.js';
import { TelegramChats } from './telegram-chats.js';

class GoalNotActive extends DomainError {
  readonly kind = 'conflict';
}

describe('TelegramBot', () => {
  let moduleRef: TestingModule;
  let telegramBot: TelegramBot;
  let recording: ReturnType<typeof recordingBot>;
  let chats: InMemoryTelegramChats;

  beforeEach(async () => {
    recording = recordingBot();
    chats = new InMemoryTelegramChats();
    moduleRef = await Test.createTestingModule({
      providers: [
        TelegramBot,
        { provide: Bot, useValue: recording.bot },
        { provide: TelegramChats, useValue: chats },
        { provide: ConfigService, useValue: webhookConfig() },
      ],
    }).compile();
    telegramBot = moduleRef.get(TelegramBot);
    telegramBot.command('streak', 'Your active days in a row', (ctx, memberId) => ctx.reply(`The streak of ${memberId}`));
    await moduleRef.init();
  });

  afterEach(() => moduleRef.close());

  it('lists the bot commands in the chat menu, and asks Telegram to post the updates to the webhook', async () => {
    await vi.waitFor(() => expect(recording.calls.map(({ method }) => method)).toContain('setWebhook'));

    expect(recording.calls.find(({ method }) => method === 'setMyCommands')?.payload.commands).toEqual([
      { command: 'streak', description: 'Your active days in a row' },
    ]);
    expect(recording.calls.find(({ method }) => method === 'setWebhook')?.payload).toMatchObject({
      url: 'https://progress.fitness.test/telegram/updates',
      secret_token: 'test-secret-token-of-at-least-32-characters',
      allowed_updates: ['message', 'callback_query'],
    });
  });

  it('runs a bot command for the member the chat is signed in as', async () => {
    await chats.signIn(7, 'ada@example.com');

    await telegramBot.handle(textMessage(7, '/streak'));

    expect(texts(recording.calls)).toEqual(['The streak of ada@example.com']);
  });

  it('asks a chat that is not signed in to sign in, without running the bot command', async () => {
    await telegramBot.handle(textMessage(7, '/streak'));

    expect(texts(recording.calls)).toEqual([expect.stringContaining('Sign in first')]);
  });

  it('ignores chats that are not private', async () => {
    await chats.signIn(7, 'ada@example.com');

    await telegramBot.handle(textMessage(7, '/streak', { chatType: 'group' }));

    expect(texts(recording.calls)).toEqual([]);
  });

  it('answers a message it does not know with the bot commands', async () => {
    await telegramBot.handle(textMessage(7, 'hello'));

    expect(texts(recording.calls)).toEqual(['I know these commands:\n/streak – Your active days in a row']);
  });

  it('replies with the message of a domain error', async () => {
    await chats.signIn(7, 'ada@example.com');
    telegramBot.command('training_goals', 'Your active training goals', () => Promise.reject(new GoalNotActive('That goal is achieved, not active')));

    await telegramBot.handle(textMessage(7, '/training_goals'));

    expect(texts(recording.calls)).toEqual(['That goal is achieved, not active']);
  });

  it('answers a button press once its work is done, and shows a domain error as an alert', async () => {
    await chats.signIn(7, 'ada@example.com');
    const pressed: Array<[string, string]> = [];
    telegramBot.button('abandon', async (_ctx, data, memberId) => {
      pressed.push([data, memberId]);
      if (data === 'achieved-goal') {
        throw new GoalNotActive('That goal is achieved, not active');
      }
    });

    await telegramBot.handle(buttonPress(7, 'abandon:active-goal'));
    await telegramBot.handle(buttonPress(7, 'abandon:achieved-goal'));

    expect(pressed).toEqual([
      ['active-goal', 'ada@example.com'],
      ['achieved-goal', 'ada@example.com'],
    ]);
    expect(recording.calls.filter(({ method }) => method === 'answerCallbackQuery').map(({ payload }) => payload)).toEqual([
      { callback_query_id: expect.any(String) },
      { callback_query_id: expect.any(String), text: 'That goal is achieved, not active', show_alert: true },
    ]);
  });

  it('logs a call that Telegram refuses, instead of failing the update', async () => {
    await chats.signIn(7, 'ada@example.com');
    recording.refuse.set('sendMessage', 'Forbidden: bot was blocked by the user');

    await expect(telegramBot.handle(textMessage(7, '/streak'))).resolves.toBeUndefined();
  });

  it('fails the update on any other error, so that Telegram sends it again', async () => {
    await chats.signIn(7, 'ada@example.com');
    telegramBot.command('personal_records', 'Your best workouts', () => Promise.reject(new Error('the database is down')));

    await expect(telegramBot.handle(textMessage(7, '/personal_records'))).rejects.toThrow('the database is down');
  });
});
