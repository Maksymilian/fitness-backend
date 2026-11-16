import { botCommands, buttonPress, buttons, texts, textMessage } from '../../../../../test/support/telegram.js';
import { PersonalRecordsQuery } from '../../../personal-records/application/queries/personal-records.query.js';
import { ProgressSummaryQuery } from '../../../progress-summary/application/queries/progress-summary.query.js';
import { StreakQuery } from '../../../progress-summary/application/queries/streak.query.js';
import { TrainingLogQuery } from '../../../training-log/application/queries/training-log.query.js';
import { MemberBotCommands } from './member-bot-commands.js';

const ride = {
  id: '0199c3a2-0000-7000-8000-000000000301',
  discipline: 'CYCLING',
  startedAt: new Date('2026-10-05T07:00:00.000Z'),
  durationSeconds: 14400,
  distanceMeters: 120000,
  calories: 2900,
};

describe('MemberBotCommands', () => {
  const queries: unknown[] = [];
  const queryBus = {
    execute: vi.fn(async (query: unknown) => {
      queries.push(query);
      if (query instanceof StreakQuery) {
        return 12;
      }
      if (query instanceof ProgressSummaryQuery) {
        return {
          period: query.kind,
          periodStart: new Date('2026-10-05T00:00:00.000Z'),
          periodEnd: new Date('2026-10-12T00:00:00.000Z'),
          discipline: query.discipline?.value ?? null,
          workoutCount: 4,
          totalDurationSeconds: 22200,
          totalDistanceMeters: 142000,
          totalCalories: 4210,
        };
      }
      if (query instanceof TrainingLogQuery) {
        const cursor = `${ride.startedAt.toISOString()}_${ride.id}`;
        return query.after
          ? { edges: [], pageInfo: { hasNextPage: false, endCursor: null } }
          : { edges: [{ cursor, node: ride }], pageInfo: { hasNextPage: true, endCursor: cursor } };
      }
      if (query instanceof PersonalRecordsQuery) {
        return [
          { discipline: 'CYCLING', metric: 'LONGEST_DISTANCE', value: 120000, setAt: ride.startedAt, loggedWorkout: ride },
          { discipline: 'CYCLING', metric: 'MOST_CALORIES', value: 2900, setAt: ride.startedAt, loggedWorkout: ride },
        ];
      }
      throw new Error(`unexpected query ${String(query)}`);
    }),
  };
  let bot: Awaited<ReturnType<typeof botCommands>>;

  beforeEach(async () => {
    queries.length = 0;
    bot = await botCommands(MemberBotCommands, { queryBus });
  });

  afterEach(() => bot.close());

  it('replies to /streak with the streak of the member the chat is signed in as', async () => {
    const sent = await bot.send(textMessage(7, '/streak'));

    expect(texts(sent)).toEqual(['🔥 12 active days in a row.']);
    expect((queries[0] as StreakQuery).memberId.value).toBe('ada@example.com');
  });

  it('replies to /progress_summary with this week, and switches the training period and the discipline with its buttons', async () => {
    const sent = await bot.send(textMessage(7, '/progress_summary'));

    expect(texts(sent)).toEqual(['🏅 Oct 5 – Oct 11, all disciplines\n4 workouts · 6 h 10 min · 142 km · 4,210 kcal']);
    expect(buttons(sent).map(({ text }) => text)).toEqual(['• Week', 'Month', 'Year', '• All', 'Cycling', 'Running', 'Walking', 'Rowing']);

    const switched = await bot.send(buttonPress(7, 'progress-summary:MONTH:CYCLING'));

    expect(switched.map(({ method }) => method)).toEqual(['editMessageText', 'answerCallbackQuery']);
    expect(queries.at(-1)).toMatchObject({ kind: 'MONTH', discipline: { value: 'CYCLING' } });
    expect(
      buttons(switched)
        .filter(({ text }) => text.startsWith('•'))
        .map(({ text }) => text),
    ).toEqual(['• Month', '• Cycling']);
  });

  it('replies to /training_log with the latest workouts, and the older ones on request', async () => {
    const sent = await bot.send(textMessage(7, '/training_log'));

    expect(texts(sent)).toEqual(['Your training log, newest first:\n🚴 Oct 5, 07:00 UTC · 4 h · 120 km · 2,900 kcal']);
    const [older] = buttons(sent);
    expect(Buffer.byteLength(older.callback_data)).toBeLessThanOrEqual(64);

    const more = await bot.send(buttonPress(7, older.callback_data));

    expect(queries.at(-1)).toMatchObject({ first: 5, after: '2026-10-05T07:00:00.000Z_0199c3a2-0000-7000-8000-000000000301' });
    expect(more.map(({ method }) => method)).toEqual(['editMessageReplyMarkup', 'sendMessage', 'answerCallbackQuery']);
    expect(texts(more)).toEqual(['No older workouts.']);
  });

  it('replies to /personal_records with the records of each discipline', async () => {
    const sent = await bot.send(textMessage(7, '/personal_records'));

    expect(texts(sent)).toEqual(['Your personal records:\n\n🚴 Cycling\nLongest distance: 120 km (Oct 5)\nMost calories: 2,900 kcal (Oct 5)']);
  });
});
