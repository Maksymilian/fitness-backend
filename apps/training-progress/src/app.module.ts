import { Module } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PlatformModule } from './platform/platform.module.js';
import { TrainingLogModule } from './training-progress/training-log/training-log.module.js';
import { PersonalRecordsModule } from './training-progress/personal-records/personal-records.module.js';
import { TrainingGoalsModule } from './training-progress/training-goals/training-goals.module.js';
import { ProgressSummaryModule } from './training-progress/progress-summary/progress-summary.module.js';
import { MembersModule } from './training-progress/members/members.module.js';
import { WorkoutTrackingAclModule } from './training-progress/workout-tracking-acl/workout-tracking-acl.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { BillingAclModule } from './training-progress/billing-acl/billing-acl.module.js';

/** Composition root of the Training Progress service. */
@Module({
  imports: [
    PlatformModule,
    TrainingLogModule,
    PersonalRecordsModule,
    TrainingGoalsModule,
    ProgressSummaryModule,
    MembersModule,
    WorkoutTrackingAclModule,
    NotificationsModule.forRoot({ templatesDirectory: mailTemplatesDirectory() }),
    BillingAclModule,
  ],
})
export class AppModule {}

/**
 * The mail templates: next to this file in the sources (development, tests), or where the CLI's
 * assets copy them next to the bundle, which keeps their path from the repository root.
 */
function mailTemplatesDirectory(): string {
  const candidates = [
    join(import.meta.dirname, 'notifications/templates'),
    join(import.meta.dirname, 'apps/training-progress/src/notifications/templates'),
  ];
  return candidates.find((directory) => existsSync(directory)) ?? candidates[0];
}
