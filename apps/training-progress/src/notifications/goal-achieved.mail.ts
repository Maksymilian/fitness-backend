import { Injectable } from '@nestjs/common';
import type { Mailable } from '@nestjs/mail';
import type { GoalAchievedV1 } from '../training-progress/published-language/topics.js';
import { MailValues } from './mail-values.js';
import type { MemberContact } from './member-contact.interface.js';

/** What the goal-achieved mail needs: the member's contact and the published goal. */
export interface GoalAchievedNotification {
  contact: MemberContact;
  goal: GoalAchievedV1;
}

/** The notification of an achieved training goal. */
@Injectable()
export class GoalAchievedMail implements Mailable<GoalAchievedNotification> {
  render({ contact, goal }: GoalAchievedNotification) {
    const target = MailValues.quantity(goal.goalMetric, goal.target);
    return {
      subject: `Goal achieved: ${target} of ${MailValues.discipline(goal.discipline).toLowerCase()}`,
      template: 'goal-achieved',
      context: {
        name: contact.name,
        target,
        discipline: MailValues.discipline(goal.discipline).toLowerCase(),
        startsOn: MailValues.date(goal.startsOn),
        endsOn: MailValues.date(goal.endsOn),
      },
    };
  }
}
