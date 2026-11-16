import { Injectable } from '@nestjs/common';
import type { Mailable } from '@nestjs/mail';
import type { PersonalRecordSetV1 } from '../training-progress/published-language/topics.js';
import { MailValues } from './mail-values.js';
import type { MemberContact } from './member-contact.interface.js';

/** What the personal-record mail needs: the member's contact and the published record. */
export interface PersonalRecordNotification {
  contact: MemberContact;
  record: PersonalRecordSetV1;
}

/** The notification of a new personal record. */
@Injectable()
export class PersonalRecordMail implements Mailable<PersonalRecordNotification> {
  render({ contact, record }: PersonalRecordNotification) {
    const metric = MailValues.recordMetric(record.recordMetric);
    const discipline = MailValues.discipline(record.discipline).toLowerCase();
    return {
      subject: `New personal record: ${metric} in ${discipline}`,
      template: 'personal-record',
      context: {
        name: contact.name,
        metric,
        discipline,
        value: MailValues.quantity(record.recordMetric, record.value),
        previous: record.previousValue === null ? null : MailValues.quantity(record.recordMetric, record.previousValue),
        date: MailValues.date(record.setAt),
      },
    };
  }
}
