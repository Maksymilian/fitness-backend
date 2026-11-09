# Ubiquitous language

This is the shared vocabulary of the fitness platform. Use these terms exactly, and only these terms, in conversations, documentation, and code: class and method names, REST paths, GraphQL types and fields, database tables, event topics, log messages, and test names.

A term belongs to a **bounded context**. The same word can mean slightly different things in two contexts, and that's intended: each context has its own model. Inside one context, one concept has one term, and one term has one meaning. When a term is shared, it says so.

Changing a term is a design change: update this file first, then rename the code in the same change.

## Used in every context

These terms mean the same thing everywhere, but there is no shared code: each context defines its own value objects for them.

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Member** | A person with an account on the platform who trains. | `MemberId` value object in each context, holding the identity provider's subject id (an opaque string). Until Identity exists, that is the member's email address, not verified | user, customer, client, athlete |
| **Discipline** | The kind of exercise a workout is: `Cycling`, `Running`, `Walking`, `Rowing`. | `Discipline`, defined separately by each context; integration events carry it as a string that the receiving context translates | type, sport, activity type, exercise |

## Workout Tracking context (supporting subdomain)

Recording what members do on connected equipment.

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Equipment** | A connected fitness machine that records workouts. Identified by its **Serial Number**. | `Equipment` aggregate, `EquipmentId`, `SerialNumber` | device, machine, hardware |
| **Equipment Type** | What kind of machine the equipment is: `Bike`, `Treadmill`, `Rower`. It decides which disciplines the equipment can record. | `EquipmentType` | model, category |
| **Supported Discipline** | A discipline the equipment type can record. Bike: Cycling. Treadmill: Running, Walking. Rower: Rowing. | `EquipmentType.supports(discipline)` | |
| **Register** | Add new equipment to the platform. | `Equipment.register()`, `EquipmentRegistered` | create, add, onboard |
| **Pairing** | The link between equipment and the member whose workouts it records. Equipment is paired with at most one member at a time. | `Equipment.pair(memberId)`, `Equipment.unpair()`, `EquipmentPaired`, `EquipmentUnpaired` | assign, link, bind, connect |
| **Paired Member** | The member the equipment is currently paired with. | `Equipment.pairedMemberId` | owner, user |
| **Workout** | One continuous exercise session, recorded by equipment from start to finish. It belongs to the member who was paired with the equipment when it was recorded. | `Workout` aggregate, `WorkoutId` | session, activity, exercise, training |
| **Recording** | The data equipment submits about a finished workout. Recording a workout creates it. | `Equipment.recordWorkout(recording)`, `WorkoutRecorded` | upload, sync, event, create |
| **Recording Id** | The id the equipment gives a recording. Unique per equipment. Submitting the same recording id again never creates a second workout. | `RecordingId` | event id, external id, request id |
| **Duplicate Recording** | A recording whose recording id was already recorded for that equipment. Answered with the existing workout. | | retry, double post |
| **Workout Metrics** | What was measured: **Duration** (active time, in seconds), **Distance** (in meters), **Calories** (kilocalories burned). | `WorkoutMetrics`, `Duration`, `Distance`, `Calories` value objects | stats, data, values |
| **Started At** | When the workout began. | `startedAt` | date, time, created at |
| **Correction** | Replacing a workout's metrics after it was recorded, because they were wrong. Needs a **Correction Reason**. Increases the workout's revision. | `Workout.correct(metrics, reason)`, `WorkoutCorrected` | update, edit, patch, fix |
| **Void** | Marking a workout as not counting, for example because someone else used the equipment. Needs a **Void Reason**. A voided workout is kept, never deleted, and can't be corrected or un-voided. | `Workout.void(reason)`, `WorkoutVoided` | delete, remove, cancel, archive |
| **Workout Status** | `Recorded` or `Voided`. | `WorkoutStatus` | state |
| **Revision** | A number that starts at 1 when the workout is recorded and increases by 1 with every correction or void. | `Workout.revision` | version |

## Training Progress context (core subdomain)

Turning workouts into progress that keeps members training.

In this context, "workout" on its own always means a **logged workout** (as in "log a workout" or "counting workouts"). Workout Tracking's workout is never modelled here; it only arrives as an integration event.

### Training log

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Training Log** | A member's counting workouts in chronological order, newest first. What the member app shows as their history. | `TrainingLog` (read model), `trainingLog` GraphQL field | history, feed, timeline, activity list |
| **Logged Workout** | This context's own model of a workout from Workout Tracking: discipline, started at, metrics. Changed only through the anticorruption layer. | `LoggedWorkout` aggregate, `LoggedWorkoutId` (the same value as the upstream WorkoutId) | workout record, activity, entry |
| **Log a Workout** | Add a workout to the member's training log. What a recording upstream becomes here. A workout whose void arrived before its recording is logged as not counting, which changes nothing in the training log. | `LoggedWorkout.log()`, `WorkoutLogged`; `LoggedWorkout.logStoppedCounting()` | import, sync, create |
| **Workout Metrics** | What a logged workout measured: duration, distance, calories. This context's own value objects, defined separately from Workout Tracking's, as with Discipline. | `WorkoutMetrics`, `Duration`, `Distance`, `Calories` value objects | stats, data, values |
| **Revise** | Replace a logged workout's metrics. What a correction upstream becomes here. | `LoggedWorkout.revise()`, `LoggedWorkoutRevised` | update, correct, edit |
| **Stop Counting** | Keep a logged workout but exclude it from everything. What a void upstream becomes here. | `LoggedWorkout.stopCounting()`, `LoggedWorkoutStoppedCounting` | delete, void, remove |
| **Counts** | A logged workout counts until it stops counting. Only counting workouts contribute to summaries, streaks, personal records and goals. | `LoggedWorkout.counts` | is active, is valid |
| **Source Revision** | The upstream's revision at the time of the last change: a logged workout's from Workout Tracking, a goal allowance's from Billing (the membership's revision). A change with an older or equal source revision is ignored. | `SourceRevision` | version, revision |

### Progress

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Training Period** | A calendar Week (ISO week, Monday to Sunday), Month or Year, in UTC. | `TrainingPeriod` value object, `PeriodKind` | range, interval, timeframe |
| **Progress Summary** | The totals of a member's counting workouts in a training period, optionally for one discipline: workout count, total duration, total distance, total calories. | `ProgressSummary` (read model) | stats, analytics, dashboard, report |
| **Active Day** | A UTC calendar day with at least one counting workout. | | training day, workout day |
| **Streak** | The number of consecutive active days ending today or yesterday. | `Streak` (read model) | chain, combo, run |

### Personal records

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Personal Record** | A member's best value of a **Record Metric** in a single counting workout of one discipline, with the logged workout it came from. Replaced as a whole when it changes. | `PersonalRecord` value object | PR, best, max, high score |
| **Personal Records** | All of a member's personal records in one discipline, one per record metric. They change together and only through it. | `PersonalRecords` aggregate | leaderboard, stats |
| **Record Metric** | What a personal record measures: `LongestDistance`, `LongestDuration`, `MostCalories`. | `RecordMetric` | |
| **Consider** | Compare a newly logged workout with the member's personal records in its discipline. | `PersonalRecords.consider(loggedWorkoutId, startedAt, metrics)` | check, evaluate |
| **Set a Personal Record** | A logged workout beats the member's current personal record, or there was none. | `PersonalRecordSet` | break, beat, achieve |
| **Record Candidate** | For one record metric, the counting logged workout with the best value in the member's training log for that discipline. | `RecordCandidate` value object | best workout, top entry |
| **Recalculate** | Set the member's personal records in a discipline from the record candidates, after a revision or a stop-counting. | `PersonalRecords.recalculate(recordCandidates)` | refresh, rebuild |
| **Withdraw a Personal Record** | The logged workout holding a personal record no longer supports it (revised lower, or stopped counting). The record falls back to the next best workout, or disappears. | `PersonalRecordWithdrawn` | revoke, delete, lower |

### Training goals

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Training Goal** | A target a member commits to for a goal period, optionally for one discipline, such as "Cycle 200 km in October". | `TrainingGoal` aggregate, `TrainingGoalId` | objective, target, challenge, plan |
| **Goal Metric** | What the goal counts: `Distance`, `Duration`, `Calories`, `WorkoutCount`. | `GoalMetric` | |
| **Goal Target** | The amount of the goal metric to reach. Always greater than zero. | `GoalTarget` value object | amount, value |
| **Goal Period** | The dates the goal runs from and to. It must end in the future when the goal is set. | `GoalPeriod` value object | duration, deadline |
| **Grace Period** | One day after the goal period ends, during which the goal stays active, so workouts from inside the goal period that are logged late still count. | `GoalPeriod.graceEnd` | buffer, extension |
| **Goal Progress Criteria** | Which logged workouts count towards a goal: counting, started inside the goal period, of the goal's discipline (if any). Defined by the goal itself. The grace period doesn't widen them. | `TrainingGoal.progressCriteria()`, `GoalProgressCriteria.isMetBy(discipline, startedAt)` | filter, query |
| **Goal Progress** | The sum of the goal metric over the logged workouts that meet the goal's progress criteria. Always calculated from the training log, never stored. | `GoalProgress` value object | completion, percentage |
| **Set a Goal** | A member creates a training goal. | `TrainingGoal.set()`, `TrainingGoalSet`, `setTrainingGoal` mutation | create, add |
| **Record Goal Progress** | Give a goal its current goal progress, so it can tell whether it's achieved. | `TrainingGoal.recordProgress(progress)` | update, check, sync |
| **Goal Status** | `Active`, `Achieved`, `Missed`, `Abandoned`. Only an active goal can change status. | `GoalStatus` | state |
| **Achieve** | Goal progress reaches the goal target while the goal is active. Happens when goal progress is recorded. **Final**: a later revision or stop-counting doesn't take an achievement back. | `TrainingGoal.recordProgress()`, `GoalAchieved` | complete, finish, win |
| **Miss** | The grace period ends while the goal is still active. | `TrainingGoal.miss()`, `GoalMissed` | fail, expire |
| **Abandon** | The goal's member gives up an active goal. | `TrainingGoal.abandon(memberId)`, `GoalAbandoned`, `abandonTrainingGoal` mutation | delete, cancel, remove |
| **Goal Allowance** | How many active training goals a member may hold at once: **one**, or **any number** while they have a membership in Billing. Checked when a goal is set; a restricted allowance never takes away goals already set. Changed only through the anticorruption layer towards Billing. | `GoalAllowance` aggregate, `GoalAllowance.ensurePermits(activeGoals)`, `GoalAllowanceReached` | quota, plan, tier, subscription, premium |
| **Extend** | A membership started: the member may hold any number of active goals. | `GoalAllowance.extend()`, `GoalAllowanceExtended`; both arrive as `ChangeGoalAllowanceCommand` | upgrade, unlock |
| **Restrict** | The membership ended: back to one active goal. | `GoalAllowance.restrict()`, `GoalAllowanceRestricted` | downgrade, lock, cancel |

### Policies

| Term | Meaning | Code |
|---|---|---|
| **Keep Personal Records** | Whenever a workout is logged, revised or stops counting, consider or recalculate the member's personal records in its discipline. | `KeepPersonalRecordsPolicy` |
| **Check Goal Achievement** | Whenever a workout is logged or revised, or a goal is set, record goal progress on each affected active goal. | `CheckGoalAchievementPolicy` |
| **Miss Ended Goals** | Every day, on its schedule trigger, miss the active goals whose grace period has ended. | `MissEndedGoalsCommand`, `ScheduleTriggersController` |

## Billing context (supporting subdomain)

What members pay for their membership, and what they paid. Stripe collects the money; Billing keeps its own model of memberships and its own ledger, and translates Stripe's objects in its anticorruption layer. Stripe's words (customer, subscription, invoice, charge) never leave that layer.

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Payment Provider** | The company that collects members' payments: Stripe, in test mode for development. Billing reaches it only through its anticorruption layer. | `PaymentProvider` port, `StripePaymentProvider`, `stripe-acl/` | gateway, PSP, processor |
| **Provider Reference** | The payment provider's id of the thing a membership or a ledger entry corresponds to (a Stripe subscription, invoice or refund), kept to recognise it again. Opaque to the model. | `ProviderReference` value object | external id, Stripe id |
| **Membership** | A member's paid access to the platform, on a membership plan, paid through a date. A member has one membership, active or ended; it starts again after it ended. | `Membership` aggregate, `MembershipId` | subscription, account, plan, license |
| **Membership Plan** | What a membership costs and how often it's paid: `Monthly` or `Yearly`. The prices live in the payment provider's catalog. | `MembershipPlan` value object | tier, package, product, price |
| **Membership Status** | `Active` (paid through a date that hasn't passed) or `Ended`. | `MembershipStatus` | state |
| **Paid Through** | The end of the last period the member paid for. | `Membership.paidThrough` | expiry, valid until, period end |
| **Renewal** | Whether the membership is paid again when it's paid through. On when it starts; the member turns it off (cancel) or on again (resume). | `Membership.renews` | auto-renew, recurring |
| **Checkout** | The payment provider's page where a member pays for a membership plan. Paying on it starts the membership. | `StartCheckoutCommand`, `POST /v1/members/:memberId/checkouts` | purchase, buy, order, subscribe |
| **Billing Portal** | The payment provider's page where a member with a membership switches plans, cancels or resumes renewal, changes their card and reads their invoices. | `OpenBillingPortalCommand`, `POST /v1/members/:memberId/billing-portal` | customer portal, account page, settings |
| **Start** | The membership begins with its first payment, paid through the end of the first period, with renewal on. A member whose membership ended starts it again the same way. | `Membership.start()`; `membership.renew()` of an ended one; `MembershipStarted` | create, activate, subscribe |
| **Renew** | A payment for the next period moves paid through forward. | `membership.renew()`, `MembershipRenewed`; Cancel, Resume, Switch Plan and End arrive as `ChangeMembershipCommand` | extend, prolong, update |
| **Switch Plan** | The member moves to the other membership plan. | `membership.switchPlan()`, `MembershipPlanSwitched` | upgrade, downgrade, change, update |
| **Cancel** | The member turns renewal off: the membership stays active until it's paid through, then ends. | `membership.cancel()`, `MembershipCancelled` | delete, end, terminate, unsubscribe |
| **Resume** | The member turns renewal on again before the membership ended. | `membership.resume()`, `MembershipResumed` | reactivate, undo, restore |
| **End** | The membership stops giving access: renewal was off and it's past paid through, or the payment provider gave up on a renewal payment. | `membership.end()`, `MembershipEnded` | expire, lapse, delete, cancel |
| **Ledger** | A member's ledger entries, newest first: what they paid and got back. | `Ledger` (read model), `GET /v1/members/:memberId/ledger` | transactions, history, statement |
| **Ledger Entry** | One movement of money between a member and the platform, as the payment provider reports it: a **Payment** or a **Refund**, with its amount, when it happened, and its provider reference. Never changed: a refund is an entry of its own. | `LedgerEntry` aggregate, `LedgerEntryId`, `LedgerEntryKind` | transaction, record, line, operation |
| **Payment** | Money a member paid for their membership: a ledger entry, zero or more. | `LedgerEntry.recordPayment()`, `PaymentRecorded` | charge, invoice, transaction |
| **Refund** | Money given back to a member: a ledger entry, more than zero. | `LedgerEntry.recordRefund()`, `RefundRecorded` | chargeback, reversal, credit |
| **Money** | An amount in a currency: a decimal (`decimal.js`, never a float) with at most two decimal places, below 100,000,000, and an ISO 4217 currency with two minor units (EUR, PLN, USD, GBP). Stored as `NUMERIC(10,2)` and a currency code. | `Money`, `Currency` value objects | price, cost, value, number |
| **Apply Payment** | Whenever a payment is recorded, start the member's membership with it, or renew it. | `ApplyPaymentPolicy` | |

## Notifications context (generic subdomain)

No domain model; a thin layer over `@nestjs/mail`. It conforms to Training Progress' published language.

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Notification** | A message telling a member about their progress. Sent by email for now. | `*Mail` classes | alert, message, push |
| **Member Contact** | Where a member is reached: name and email address. Translated from the identity provider's user profile by the `MemberContactDirectory` adapter. Until the provider exists, a development adapter uses the member id, an email address. | `MemberContact`, `MemberContactDirectory` port | profile, user details |
| **Notify Personal Record** | Send a notification when a personal record is set. | `NotifyPersonalRecordHandler` | |
| **Notify Goal Achieved** | Send a notification when a training goal is achieved. | `NotifyGoalAchievedHandler` | |

## Telegram bot (an interface of Training Progress)

Members read their progress and manage their training goals in a Telegram chat. The bot uses Training Progress' terms: each bot command is named after what it shows or does. Signing in stands in for Identity (generic) until an identity provider exists.

| Term | Meaning | Code | Don't say |
|---|---|---|---|
| **Telegram Chat** | A private chat between a member and the platform's Telegram bot. Signed in as at most one member at a time. | `TelegramChats`, `telegram_chats` table | user, account, conversation |
| **Sign In** | Tie a Telegram chat to a member, with `/sign_in` and the member id: until Identity exists, the member's email address, not verified, as everywhere else. Signing in again replaces the member. | `/sign_in`, `TelegramChats.signIn()` | register, link, connect, pair, log in |
| **Sign Out** | Untie a Telegram chat from its member. | `/sign_out`, `TelegramChats.signOut()` | unlink, disconnect, log out |
| **Bot Command** | A slash command in a Telegram chat: `/training_log`, `/progress_summary`, `/streak`, `/personal_records`, `/training_goals`. Each one but `/start`, `/sign_in` and `/sign_out` needs a signed-in chat. | `TelegramBot.command()`, `*BotCommands` classes | |

## Integration and building blocks

| Term | Meaning | Code |
|---|---|---|
| **Domain Event** | A business fact that happened inside a context, raised by an aggregate, named in the past tense. Internal to its context. | `libs/ddd` `DomainEvent`; topics `<context>.domain.<event>.v<n>` |
| **Integration Event** | A fact a context publishes for other contexts, mapped from a domain event into the published language. Versioned. Between services, it travels as a CloudEvent. | Topics `<context>.integration.<event>.v<n>` |
| **CloudEvent** | An integration event in the CloudEvents 1.0 format, as it travels between services: attributes (`id`, `source`, `type` = the topic, `subject`, `time`, `partitionkey`) around the payload, its `data`. | `cloudevents` SDK `CloudEvent`; `WORKOUT_TRACKING_SOURCE`; `CloudEventSerializer`, `CloudEventDeserializer` |
| **Published Language** | A context's integration events: topic names and payloads, and the CloudEvents `source` of those that leave the service. Owned by the upstream context. | `libs/workout-tracking-contracts`, `libs/billing-contracts`, `training-progress/published-language/` |
| **Schedule Trigger** | A CloudEvent that a Kubernetes CronJob publishes at a set time to a service's schedule queue, to start time-based work such as Miss Ended Goals. Carries no data; one instance handles it. | `scripts/scheduler/`, `ScheduleTriggers`; types `<context>.schedule.<policy>.v<n>` |
| **Flow** | One interaction of a member that takes several roundtrips (a session in an app, a conversation with the bot, a Postman run): every trace of it carries the same flow id. OpenTelemetry's `session.id`, carried as W3C Baggage. | `@app/telemetry`: `FLOW_ID`, `inFlow()`, `inRoundtrip()`, `FlowMiddleware`, `MessageFlowInterceptor` |
| **Interface** | How an interaction reached the platform: GraphQL, the REST API, the Telegram bot, Stripe's webhook, or RabbitMQ (a message no interaction started, such as a schedule trigger). Set where the interaction enters and carried with it like the flow, so every span and log record of it, in each service, says where it came from. | `@app/telemetry`: `INTERFACE` (`interface`), `inInterface()`, `InterfaceMiddleware`; `graphql`, `rest`, `telegram`, `stripe`, `rabbitmq` |
| **Policy** | A reaction to a domain event ("whenever X, then Y") that changes one aggregate per transaction. | `*Policy` |
| **Anticorruption Layer** | The part of a context that validates another model's messages and translates them into its own language and commands: Training Progress' towards Workout Tracking and Billing, Billing's towards Stripe (its webhook events, and the calls Billing makes to it). | `workout-tracking-acl/`, `billing-acl/`, `stripe-acl/` |
| **Outbox** | Where a context stores its domain and integration events in the same transaction as the change, until they're delivered. | `@nestjs/outbox`, `nest_outbox.messages` |
| **Inbox** | Where a consumer records the events it has already applied, so a redelivery changes nothing. | `OutboxInbox`, `nest_outbox.inbox` |
| **Rate Limit** | The most requests one caller (an IP address) may send to a service in a minute. Past it, the request is rejected with 429 (and `TOO_MANY_REQUESTS` over GraphQL). Off by default: with `RATE_LIMIT=on` (locally), each instance counts; in AWS, a WAF rate-based rule in front of the services does. | `@nestjs/throttler`, `RateLimitGuard`, `RATE_LIMIT`, `RATE_LIMIT_PER_MINUTE`, `rate_limit_rejected_requests_total`; AWS WAF |
| **Query Timeout** | How long a query (a GET route, a GraphQL query field) may take before its caller gets an error instead of the result: 504 over HTTP, `TIMEOUT` over GraphQL. The work itself goes on. Writes have none. | `@nestjs/resilience`'s `@Timeout()`, `QUERY_TIMEOUT_MS`, `resilience_events_total` (the package calls its stages policies: not this glossary's Policy) |
| **Fault** | A failure caused on purpose, locally, between a service and its PostgreSQL, Redis or RabbitMQ (latency, a dependency that stops answering or is down), to watch how the service behaves. | Toxiproxy (Compose profile `faults`), `scripts/faults/fault.sh` |
| **Read Cache** | Training Progress' read models kept in Redis (progress summaries, personal records, streaks): read from it first, loaded from PostgreSQL on a miss, forgotten by the events that make them stale. Off with `READ_CACHE=off`, to compare. | `ReadCache`, `CacheKeys`, `READ_CACHE`, `read_cache_reads_total` |
| **Cache Stampede** | Many reads missing the same cached read model at once, each loading the same thing from PostgreSQL: when it expires (every streak at midnight UTC) or an event forgets it while many apps read it. | `load-tests/streak-stampede.ts` |
| **Load Lock** | The lock on a cached read model's key that lets one caller, on any instance, load it after a miss, while the others wait up to 10 seconds for its value. | `@nestjs/locks`, `RedisLockStore`, `READ_CACHE_LOCK` |
| **Load Test** | Traffic like the members' apps', at set rates, then the verdict: p95 under its limit, no error, every event delivered once, nothing dead-lettered or left in a queue, no alert. Each run has a test id, `<test>-<UTC time>`. | k6 (Compose service `k6`), `load-tests/`: smoke, stress, spike, streak-stampede, backlog, reconcile; `testid` on the k6 Prometheus dashboard |
| **Service Version** | The build or deployment a service runs, on all its telemetry, so that two versions serving at once (a rolling deploy) can be compared. | `service.version`, the `service_version` label |
