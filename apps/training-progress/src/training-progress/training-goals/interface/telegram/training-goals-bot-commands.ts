import { isUuid } from '@app/ddd';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { InlineKeyboard } from 'grammy';
import { type ButtonContext, TelegramBot } from '../../../../platform/telegram/telegram-bot.js';
import { type PeriodKind, TrainingPeriod } from '../../../calendar/domain/values/training-period.js';
import { MemberId } from '../../../members/domain/values/member-id.js';
import * as format from '../../../members/interface/telegram/bot-formatting.js';
import { Discipline } from '../../../training-log/domain/values/discipline.js';
import { AbandonTrainingGoalCommand } from '../../application/commands/abandon-training-goal.command.js';
import { SetTrainingGoalCommand } from '../../application/commands/set-training-goal.command.js';
import { TrainingGoalProgressQuery } from '../../application/queries/training-goal-progress.query.js';
import { TrainingGoalsQuery } from '../../application/queries/training-goals.query.js';
import type { TrainingGoalRepresentation } from '../../application/training-goal.representation.interface.js';
import { GoalMetric, type GoalMetricName } from '../../domain/values/goal-metric.js';
import { GoalStatus } from '../../domain/values/goal-status.js';
import { GoalTarget } from '../../domain/values/goal-target.js';
import { TrainingGoalId } from '../../domain/values/training-goal-id.js';

// Buttons. The set-goal wizard keeps its choices in the callback data, so it needs no session:
// set-goal[:<metric>[:<discipline or ANY>[:<target>[:<period kind>:<period start>]]]], and
// set-goal-confirmed with all five. At most 64 bytes, which the longest one fits.
const TRAINING_GOALS = 'training-goals';
const ABANDON = 'abandon';
const ABANDON_CONFIRMED = 'abandon-confirmed';
const SET_GOAL = 'set-goal';
const SET_GOAL_CONFIRMED = 'set-goal-confirmed';
const ANY_DISCIPLINE = 'ANY';

const METRICS: Record<GoalMetricName, string> = { DISTANCE: 'Distance', DURATION: 'Duration', CALORIES: 'Calories', WORKOUT_COUNT: 'Workouts' };
/** Goal targets to choose from, in the goal metric's unit: meters, seconds, kilocalories, workouts. */
const TARGETS: Record<GoalMetricName, readonly number[]> = {
  DISTANCE: [25_000, 50_000, 100_000, 200_000, 500_000],
  DURATION: [5, 10, 20, 40].map((hours) => hours * 3600),
  CALORIES: [2_000, 5_000, 10_000, 20_000],
  WORKOUT_COUNT: [4, 8, 12, 20],
};
const PERIODS: Record<PeriodKind, string> = { WEEK: 'This week', MONTH: 'This month', YEAR: 'This year' };

/** A goal's choices, as the wizard's buttons carry them. */
interface GoalChoices {
  metric: GoalMetric;
  discipline: Discipline | null;
  target: GoalTarget;
  period: TrainingPeriod;
}

/**
 * The bot commands and buttons for training goals: the active goals with their goal progress, and
 * the set-goal and abandon buttons, which dispatch the commands the GraphQL mutations do.
 */
@Injectable()
export class TrainingGoalsBotCommands implements OnModuleInit {
  constructor(
    private readonly bot: TelegramBot,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  onModuleInit(): void {
    this.bot.command('training_goals', 'Your active training goals', async (ctx, memberId) => {
      const { text, keyboard } = await this.activeGoals(memberId);
      await ctx.reply(text, { reply_markup: keyboard });
    });
    this.bot.button(TRAINING_GOALS, async (ctx, _data, memberId) => {
      const { text, keyboard } = await this.activeGoals(memberId);
      await ctx.editMessageText(text, { reply_markup: keyboard });
    });
    this.bot.button(ABANDON, (ctx, id, memberId) => this.confirmAbandon(ctx, id, memberId));
    this.bot.button(ABANDON_CONFIRMED, (ctx, id, memberId) => this.abandon(ctx, id, memberId));
    this.bot.button(SET_GOAL, (ctx, data) => this.setGoalStep(ctx, data));
    this.bot.button(SET_GOAL_CONFIRMED, (ctx, data, memberId) => this.setGoal(ctx, data, memberId));
  }

  private async activeGoals(memberId: string) {
    const goals = await this.queryBus.execute(new TrainingGoalsQuery(MemberId.from(memberId), GoalStatus.Active));
    const keyboard = new InlineKeyboard();
    if (goals.length === 0) {
      return { text: 'You have no active training goals.', keyboard: keyboard.text('Set a goal', SET_GOAL) };
    }
    const lines: string[] = [];
    for (const goal of goals) {
      const progress = await this.queryBus.execute(new TrainingGoalProgressQuery(goal));
      const percent = Math.min(100, Math.floor((progress / goal.target) * 100));
      lines.push(`${describe(goal)}\n${amount(goal.metric, progress)} of ${amount(goal.metric, goal.target)} (${percent}%)`);
      keyboard.text(`Abandon: ${name(goal)}`, `${ABANDON}:${goal.id}`).row();
    }
    return { text: `Your active training goals:\n\n${lines.join('\n\n')}`, keyboard: keyboard.text('Set a goal', SET_GOAL) };
  }

  private async confirmAbandon(ctx: ButtonContext, id: string, memberId: string) {
    const goals = isUuid(id) ? await this.queryBus.execute(new TrainingGoalsQuery(MemberId.from(memberId), GoalStatus.Active)) : [];
    const goal = goals.find((candidate) => candidate.id === id.toLowerCase());
    if (!goal) {
      const { text, keyboard } = await this.activeGoals(memberId);
      return ctx.editMessageText(`That goal isn't active anymore.\n\n${text}`, { reply_markup: keyboard });
    }
    return ctx.editMessageText(`Abandon this goal?\n\n${describe(goal)}`, {
      reply_markup: new InlineKeyboard().text('Abandon it', `${ABANDON_CONFIRMED}:${goal.id}`).text('Keep it', TRAINING_GOALS),
    });
  }

  private async abandon(ctx: ButtonContext, id: string, memberId: string) {
    if (!isUuid(id)) {
      return;
    }
    // The goal checks that it's this member's, and still active.
    const goal = await this.commandBus.execute(new AbandonTrainingGoalCommand(MemberId.from(memberId), TrainingGoalId.from(id)));
    return ctx.editMessageText(`Abandoned:\n\n${describe(goal)}`, { reply_markup: new InlineKeyboard().text('Training goals', TRAINING_GOALS) });
  }

  /** One step of the set-goal wizard: asks for the next choice, or to confirm once all are made. */
  private async setGoalStep(ctx: ButtonContext, data: string) {
    const [metric, discipline, target, kind, start] = data ? data.split(':') : [];
    const cancel = (keyboard: InlineKeyboard) => keyboard.row().text('Cancel', TRAINING_GOALS);

    if (metric === undefined) {
      const keyboard = new InlineKeyboard();
      Object.entries(METRICS).forEach(([value, label], index) => {
        keyboard.text(label, `${SET_GOAL}:${value}`);
        if (index % 2 === 1) {
          keyboard.row();
        }
      });
      return ctx.editMessageText('Set a goal: what should it count?', { reply_markup: cancel(keyboard) });
    }

    const goalMetric = GoalMetric.from(metric);
    if (discipline === undefined) {
      const keyboard = new InlineKeyboard().text('Any discipline', `${SET_GOAL}:${metric}:${ANY_DISCIPLINE}`).row();
      Discipline.all.forEach(({ value }, index) => {
        keyboard.text(`${format.disciplineIcon(value)} ${format.disciplineName(value)}`, `${SET_GOAL}:${metric}:${value}`);
        if (index % 2 === 1) {
          keyboard.row();
        }
      });
      return ctx.editMessageText(`Set a goal: ${METRICS[goalMetric.value].toLowerCase()} of which discipline?`, { reply_markup: cancel(keyboard) });
    }

    const goalDiscipline = disciplineOf(discipline);
    if (target === undefined) {
      const keyboard = new InlineKeyboard();
      TARGETS[goalMetric.value].forEach((amountOf, index) => {
        keyboard.text(amount(goalMetric.value, amountOf), `${SET_GOAL}:${metric}:${discipline}:${amountOf}`);
        if (index % 3 === 2) {
          keyboard.row();
        }
      });
      return ctx.editMessageText('Set a goal: how much?', { reply_markup: cancel(keyboard) });
    }

    const goalTarget = GoalTarget.of(Number(target));
    if (kind === undefined) {
      const keyboard = new InlineKeyboard();
      for (const [periodKind, label] of Object.entries(PERIODS) as Array<[PeriodKind, string]>) {
        const period = TrainingPeriod.containing(periodKind, new Date());
        keyboard
          .text(`${label}, ${format.days(period.start, period.end)}`, `${SET_GOAL}:${metric}:${discipline}:${target}:${periodKind}:${isoDay(period.start)}`)
          .row();
      }
      return ctx.editMessageText(`Set a goal: ${name({ metric, target: goalTarget.value, discipline: goalDiscipline?.value ?? null })} by when?`, {
        reply_markup: cancel(keyboard),
      });
    }

    const choices = goalChoices([metric, discipline, target, kind, start]);
    if (!choices) {
      return;
    }
    return ctx.editMessageText(`Set this goal?\n\n${describe(representChoices(choices))}`, {
      reply_markup: new InlineKeyboard().text('Set the goal', `${SET_GOAL_CONFIRMED}:${data}`).text('Cancel', TRAINING_GOALS),
    });
  }

  private async setGoal(ctx: ButtonContext, data: string, memberId: string) {
    const choices = goalChoices(data.split(':'));
    if (!choices) {
      return;
    }
    const { metric, target, discipline, period } = choices;
    // The goal period is checked by the goal: it must still end in the future.
    const goal = await this.commandBus.execute(new SetTrainingGoalCommand(MemberId.from(memberId), metric, target, discipline, period.start, period.end));
    return ctx.editMessageText(`Goal set:\n\n${describe(goal)}`, { reply_markup: new InlineKeyboard().text('Training goals', TRAINING_GOALS) });
  }
}

/** All of the wizard's choices, validated by their value objects; `null` when some are missing. */
function goalChoices([metric, discipline, target, kind, start]: string[]): GoalChoices | null {
  if (!metric || !discipline || !target || !kind || !start || !/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start))) {
    return null;
  }
  return {
    metric: GoalMetric.from(metric),
    discipline: disciplineOf(discipline),
    target: GoalTarget.of(Number(target)),
    period: TrainingPeriod.containing(TrainingPeriod.periodKind(kind), new Date(`${start}T00:00:00.000Z`)),
  };
}

function representChoices({ metric, discipline, target, period }: GoalChoices) {
  return { metric: metric.value, discipline: discipline?.value ?? null, target: target.value, startsOn: period.start, endsOn: period.end };
}

function disciplineOf(value: string): Discipline | null {
  return value === ANY_DISCIPLINE ? null : Discipline.from(value);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** An amount of the goal metric: `200 km`, `10 h`, `5,000 kcal`, `12 workouts`. */
function amount(metric: string, value: number): string {
  switch (metric) {
    case 'DISTANCE':
      return format.distance(value);
    case 'DURATION':
      return format.duration(value);
    case 'CALORIES':
      return format.calories(value);
    default:
      return format.workouts(value);
  }
}

/** `200 km of cycling`, or `12 workouts` for any discipline. */
function name({ metric, target, discipline }: Pick<TrainingGoalRepresentation, 'metric' | 'target' | 'discipline'>): string {
  return discipline ? `${amount(metric, target)} of ${format.disciplineName(discipline).toLowerCase()}` : amount(metric, target);
}

/** `🚴 200 km of cycling, Oct 1 – Oct 31`. */
function describe(goal: Pick<TrainingGoalRepresentation, 'metric' | 'target' | 'discipline' | 'startsOn' | 'endsOn'>): string {
  return `${format.disciplineIcon(goal.discipline)} ${name(goal)}, ${format.days(goal.startsOn, goal.endsOn)}`;
}
