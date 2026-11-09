import { Command } from '@nestjs/cqrs';
import type { MemberId } from '../../../members/domain/values/member-id.js';
import type { SourceRevision } from '../../../training-log/domain/values/source-revision.js';

/**
 * Extend or Restrict a member's goal allowance: what a membership that started or ended in Billing
 * becomes here. `messageId` makes it exactly-once; `sourceRevision` guards against reordering.
 */
export class ChangeGoalAllowanceCommand extends Command<void> {
  constructor(
    readonly memberId: MemberId,
    readonly change: 'extend' | 'restrict',
    readonly sourceRevision: SourceRevision,
    readonly messageId: string,
  ) {
    super();
  }
}
