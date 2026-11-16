import { botCommands, buttonPress, buttons, texts, textMessage } from '../../../../../test/support/telegram.js';
import { TrainingPeriod } from '../../../calendar/domain/values/training-period.js';
import { AbandonTrainingGoalCommand } from '../../application/commands/abandon-training-goal.command.js';
import { SetTrainingGoalCommand } from '../../application/commands/set-training-goal.command.js';
import { TrainingGoalProgressQuery } from '../../application/queries/training-goal-progress.query.js';
import { TrainingGoalsQuery } from '../../application/queries/training-goals.query.js';
import type { TrainingGoalRepresentation } from '../../application/training-goal.representation.interface.js';
import { TrainingGoalsBotCommands } from './training-goals-bot-commands.js';

const goal: TrainingGoalRepresentation = {
  id: '0199c3a2-0000-7000-8000-000000000201',
  memberId: 'ada@example.com',
  metric: 'DISTANCE',
  target: 200000,
  discipline: 'CYCLING',
  startsOn: new Date('2026-10-01T00:00:00.000Z'),
  endsOn: new Date('2026-11-01T00:00:00.000Z'),
  status: 'ACTIVE',
  achievedAt: null,
};

describe('TrainingGoalsBotCommands', () => {
  const commands: unknown[] = [];
  const queryBus = {
    execute: vi.fn(async (query: unknown) => {
      if (query instanceof TrainingGoalsQuery) {
        return [goal];
      }
      if (query instanceof TrainingGoalProgressQuery) {
        return 142000;
      }
      throw new Error(`unexpected query ${String(query)}`);
    }),
  };
  const commandBus = {
    execute: vi.fn(async (command: unknown) => {
      commands.push(command);
      if (command instanceof SetTrainingGoalCommand) {
        return {
          ...goal,
          metric: command.metric.value,
          target: command.target.value,
          discipline: command.discipline?.value ?? null,
          startsOn: command.startsOn,
          endsOn: command.endsOn,
        };
      }
      return { ...goal, status: 'ABANDONED' };
    }),
  };
  let bot: Awaited<ReturnType<typeof botCommands>>;

  beforeEach(async () => {
    commands.length = 0;
    bot = await botCommands(TrainingGoalsBotCommands, { queryBus, commandBus });
  });

  afterEach(() => bot.close());

  it('replies to /training_goals with the active goals and their goal progress', async () => {
    const sent = await bot.send(textMessage(7, '/training_goals'));

    expect(texts(sent)).toEqual(['Your active training goals:\n\n🚴 200 km of cycling, Oct 1 – Oct 31\n142 km of 200 km (71%)']);
    expect(buttons(sent)).toEqual([
      { text: 'Abandon: 200 km of cycling', callback_data: `abandon:${goal.id}` },
      { text: 'Set a goal', callback_data: 'set-goal' },
    ]);
  });

  it('asks to confirm before it abandons a goal for the member the chat is signed in as', async () => {
    const confirm = await bot.send(buttonPress(7, `abandon:${goal.id}`));

    expect(texts(confirm)).toEqual(['Abandon this goal?\n\n🚴 200 km of cycling, Oct 1 – Oct 31']);
    expect(commands).toEqual([]);

    const abandoned = await bot.send(buttonPress(7, buttons(confirm)[0].callback_data));

    expect(texts(abandoned)).toEqual(['Abandoned:\n\n🚴 200 km of cycling, Oct 1 – Oct 31']);
    expect(commands).toEqual([expect.any(AbandonTrainingGoalCommand)]);
    expect(commands[0]).toMatchObject({ memberId: { value: 'ada@example.com' }, trainingGoalId: { value: goal.id } });
  });

  it('sets a goal once the wizard has every choice, with buttons that fit in 64 bytes', async () => {
    const press = async (label: string, from: Array<{ text: string; callback_data: string }>) => {
      const button = from.find(({ text }) => text.startsWith(label));
      expect(button, `a "${label}" button among ${from.map(({ text }) => text).join(', ')}`).toBeDefined();
      return bot.send(buttonPress(7, button!.callback_data));
    };

    const metric = await bot.send(buttonPress(7, 'set-goal'));
    const discipline = await press('Workouts', buttons(metric));
    const target = await press('🚶 Walking', buttons(discipline));
    const period = await press('20 workouts', buttons(target));
    const confirm = await press('This month', buttons(period));
    expect(commands).toEqual([]);
    const set = await press('Set the goal', buttons(confirm));

    for (const sent of [metric, discipline, target, period, confirm, set]) {
      for (const { callback_data } of buttons(sent)) {
        expect(Buffer.byteLength(callback_data)).toBeLessThanOrEqual(64);
      }
    }
    const thisMonth = TrainingPeriod.containing('MONTH', new Date());
    expect(commands).toEqual([expect.any(SetTrainingGoalCommand)]);
    expect(commands[0]).toMatchObject({
      memberId: { value: 'ada@example.com' },
      metric: { value: 'WORKOUT_COUNT' },
      target: { value: 20 },
      discipline: { value: 'WALKING' },
      startsOn: thisMonth.start,
      endsOn: thisMonth.end,
    });
    expect(texts(set)).toEqual([expect.stringMatching(/^Goal set:\n\n🚶 20 workouts of walking, /)]);
  });
});
