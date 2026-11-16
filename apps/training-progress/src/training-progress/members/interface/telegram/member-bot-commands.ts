import { Injectable, type OnModuleInit } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type Context, InlineKeyboard } from 'grammy';
import { TelegramBot } from '../../../../platform/telegram/telegram-bot.js';
import { type PeriodKind, TrainingPeriod } from '../../../calendar/domain/values/training-period.js';
import type { PersonalRecordRepresentation } from '../../../personal-records/application/personal-record.representation.interface.js';
import { PersonalRecordsQuery } from '../../../personal-records/application/queries/personal-records.query.js';
import { ProgressSummaryQuery } from '../../../progress-summary/application/queries/progress-summary.query.js';
import { StreakQuery } from '../../../progress-summary/application/queries/streak.query.js';
import { TrainingLogQuery } from '../../../training-log/application/queries/training-log.query.js';
import { Discipline } from '../../../training-log/domain/values/discipline.js';
import { MemberId } from '../../domain/values/member-id.js';
import * as format from './bot-formatting.js';

const TRAINING_LOG_PAGE = 5;

/** Callback data is at most 64 bytes: `tl:` and a training log cursor (61 characters) just fit. */
const OLDER_WORKOUTS = 'tl';
const PROGRESS_SUMMARY = 'progress-summary';
const ALL_DISCIPLINES = 'ALL';

const PERIOD_KINDS: readonly PeriodKind[] = ['WEEK', 'MONTH', 'YEAR'];
const PERIOD_LABELS: Record<PeriodKind, string> = { WEEK: 'Week', MONTH: 'Month', YEAR: 'Year' };
const RECORD_METRICS: Record<string, { label: string; value: (amount: number) => string }> = {
  LONGEST_DISTANCE: { label: 'Longest distance', value: format.distance },
  LONGEST_DURATION: { label: 'Longest duration', value: format.duration },
  MOST_CALORIES: { label: 'Most calories', value: format.calories },
};

/**
 * The bot commands that show a member's progress. Each one dispatches the query of the `Member`
 * field it's named after, as `MemberResolver` does.
 */
@Injectable()
export class MemberBotCommands implements OnModuleInit {
  constructor(
    private readonly bot: TelegramBot,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit(): void {
    this.bot.command('training_log', 'Your latest workouts', (ctx, memberId) => this.trainingLog(ctx, memberId, null));
    this.bot.button(OLDER_WORKOUTS, async (ctx, after, memberId) => {
      // The button has done its job: the older workouts come in a message of their own.
      await ctx.editMessageReplyMarkup();
      await this.trainingLog(ctx, memberId, after);
    });

    this.bot.command('progress_summary', 'Your totals this week, month or year', async (ctx, memberId) => {
      const { text, keyboard } = await this.progressSummary(memberId, 'WEEK', null);
      await ctx.reply(text, { reply_markup: keyboard });
    });
    this.bot.button(PROGRESS_SUMMARY, async (ctx, data, memberId) => {
      const [kind = '', discipline = ''] = data.split(':');
      const { text, keyboard } = await this.progressSummary(
        memberId,
        TrainingPeriod.periodKind(kind),
        discipline === ALL_DISCIPLINES ? null : Discipline.from(discipline).value,
      );
      await ctx.editMessageText(text, { reply_markup: keyboard });
    });

    this.bot.command('streak', 'Your active days in a row', async (ctx, memberId) => {
      const streak = await this.queryBus.execute(new StreakQuery(MemberId.from(memberId), new Date()));
      await ctx.reply(streak === 0 ? 'No streak yet: a day with a workout starts one.' : `🔥 ${streak} active ${streak === 1 ? 'day' : 'days'} in a row.`);
    });

    this.bot.command('personal_records', 'Your best workouts in each discipline', async (ctx, memberId) => {
      const records = await this.queryBus.execute(new PersonalRecordsQuery(MemberId.from(memberId), null));
      await ctx.reply(records.length === 0 ? 'No personal records yet: your workouts set them.' : personalRecords(records));
    });
  }

  private async trainingLog(ctx: Context, memberId: string, after: string | null) {
    const page = await this.queryBus.execute(new TrainingLogQuery(MemberId.from(memberId), TRAINING_LOG_PAGE, after || null, null));
    if (page.edges.length === 0) {
      return ctx.reply(after ? 'No older workouts.' : 'Your training log is empty: the workouts your equipment records show up here.');
    }
    const workouts = page.edges.map(({ node }) => format.loggedWorkout(node)).join('\n');
    const older = page.pageInfo.endCursor && `${OLDER_WORKOUTS}:${page.pageInfo.endCursor}`;
    const keyboard = page.pageInfo.hasNextPage && older && Buffer.byteLength(older) <= 64 ? new InlineKeyboard().text('Older workouts', older) : undefined;
    return ctx.reply(`${after ? 'Older workouts' : 'Your training log, newest first'}:\n${workouts}`, { reply_markup: keyboard });
  }

  /** The summary, with buttons for the other training periods and disciplines. */
  private async progressSummary(memberId: string, kind: PeriodKind, discipline: string | null) {
    const summary = await this.queryBus.execute(
      new ProgressSummaryQuery(MemberId.from(memberId), kind, new Date(), discipline ? Discipline.from(discipline) : null),
    );
    const text = [
      `${format.disciplineIcon(discipline)} ${format.days(summary.periodStart, summary.periodEnd)}, ${discipline ? format.disciplineName(discipline) : 'all disciplines'}`,
      [
        format.workouts(summary.workoutCount),
        format.duration(summary.totalDurationSeconds),
        format.distance(summary.totalDistanceMeters),
        format.calories(summary.totalCalories),
      ].join(' · '),
    ].join('\n');

    const keyboard = new InlineKeyboard();
    for (const candidate of PERIOD_KINDS) {
      keyboard.text(selected(candidate === kind, PERIOD_LABELS[candidate]), `${PROGRESS_SUMMARY}:${candidate}:${discipline ?? ALL_DISCIPLINES}`);
    }
    keyboard.row().text(selected(discipline === null, 'All'), `${PROGRESS_SUMMARY}:${kind}:${ALL_DISCIPLINES}`);
    Discipline.all.forEach((candidate, index) => {
      // Three buttons a row fit a phone's width.
      if (index === 2) {
        keyboard.row();
      }
      keyboard.text(selected(candidate.value === discipline, format.disciplineName(candidate.value)), `${PROGRESS_SUMMARY}:${kind}:${candidate.value}`);
    });
    return { text, keyboard };
  }
}

function selected(isSelected: boolean, label: string): string {
  return isSelected ? `• ${label}` : label;
}

/** Grouped by discipline, in the order of `Discipline.all`. */
function personalRecords(records: PersonalRecordRepresentation[]): string {
  const sections = Discipline.all
    .map(({ value: discipline }) => {
      const lines = records
        .filter((record) => record.discipline === discipline)
        .map(({ metric, value, loggedWorkout }) => {
          const { label, value: amount } = RECORD_METRICS[metric] ?? { label: metric, value: String };
          return `${label}: ${amount(value)} (${format.day(loggedWorkout.startedAt)})`;
        });
      return lines.length === 0 ? null : [`${format.disciplineIcon(discipline)} ${format.disciplineName(discipline)}`, ...lines].join('\n');
    })
    .filter((section) => section !== null);
  return `Your personal records:\n\n${sections.join('\n\n')}`;
}
