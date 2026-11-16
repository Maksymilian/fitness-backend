import { type DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileMailTransport, FileTemplateEngine, MailModule, type MailTransport, ResendTransport, SmtpTransport } from '@nestjs/mail';
import type { Environment } from '../platform/config/environment.js';
import { DevelopmentMemberContactDirectory } from './development-member-contact-directory.js';
import { GoalAchievedMail } from './goal-achieved.mail.js';
import { MemberContactDirectory } from './member-contact-directory.js';
import { NotifyGoalAchievedHandler } from './notify-goal-achieved.handler.js';
import { NotifyPersonalRecordHandler } from './notify-personal-record.handler.js';
import { PersonalRecordMail } from './personal-record.mail.js';

/**
 * Notifications: a generic bounded context hosted in this service, a thin layer over
 * `@nestjs/mail` with no domain model. It conforms to Training Progress' published language, and
 * never imports its domain.
 */
@Module({})
export class NotificationsModule {
  static forRoot(options: { templatesDirectory: string }): DynamicModule {
    return {
      module: NotificationsModule,
      imports: [
        MailModule.forRootAsync({
          inject: [ConfigService],
          // Runs at startup: a bad MAIL_TRANSPORT or a missing SMTP_URL stops the app there.
          useFactory: (config: ConfigService<Environment, true>) => ({
            transport: mailTransport(config),
            templates: new FileTemplateEngine({
              dir: options.templatesDirectory,
              layout: 'layout',
              // Development reads the files for every mail, so edits show up without a restart.
              cache: config.get('NODE_ENV', { infer: true }) === 'production',
            }),
            from: config.get('MAIL_FROM', { infer: true }),
          }),
        }),
      ],
      providers: [
        PersonalRecordMail,
        GoalAchievedMail,
        NotifyPersonalRecordHandler,
        NotifyGoalAchievedHandler,
        { provide: MemberContactDirectory, useClass: DevelopmentMemberContactDirectory },
      ],
    };
  }
}

/** `file` in development (the default), `smtp` or `resend` in production. */
function mailTransport(config: ConfigService<Environment, true>): MailTransport {
  switch (config.get('MAIL_TRANSPORT', { infer: true })) {
    // validateEnvironment() requires SMTP_URL with smtp and RESEND_API_KEY with resend, so neither `!` can be undefined.
    case 'smtp':
      return new SmtpTransport({ url: config.get('SMTP_URL', { infer: true })!, pool: true });
    case 'resend':
      return new ResendTransport({ apiKey: config.get('RESEND_API_KEY', { infer: true })! });
    default:
      return new FileMailTransport({ directory: config.get('MAIL_DIRECTORY', { infer: true }) });
  }
}
