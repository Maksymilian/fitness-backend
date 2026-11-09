import { MemberId } from '../../members/domain/values/member-id.js';
import { SourceRevision } from '../../training-log/domain/values/source-revision.js';
import { GoalAllowanceReached } from './errors/goal-allowance-reached.js';
import { GoalAllowanceExtended } from './events/goal-allowance-extended.js';
import { GoalAllowanceRestricted } from './events/goal-allowance-restricted.js';
import { GoalAllowance } from './goal-allowance.js';

const grace = MemberId.from('grace@example.com');
const now = new Date('2026-10-30T10:00:00Z');
const revision = (value: number) => SourceRevision.of(value);

describe('GoalAllowance', () => {
  it('permits one active goal to a member without a membership', () => {
    const allowance = GoalAllowance.of(grace);

    expect(() => allowance.ensurePermits(0)).not.toThrow();
    expect(() => allowance.ensurePermits(1)).toThrow(GoalAllowanceReached);
  });

  it('extends to any number of active goals when a membership starts', () => {
    const allowance = GoalAllowance.of(grace);

    allowance.extend(revision(1), now);

    expect(allowance.pullDomainEvents()).toEqual([expect.any(GoalAllowanceExtended)]);
    expect(() => allowance.ensurePermits(25)).not.toThrow();
  });

  it('restricts to one again when the membership ends', () => {
    const allowance = GoalAllowance.of(grace);
    allowance.extend(revision(1), now);
    allowance.pullDomainEvents();

    allowance.restrict(revision(4), now);

    expect(allowance.pullDomainEvents()).toEqual([expect.any(GoalAllowanceRestricted)]);
    expect(() => allowance.ensurePermits(1)).toThrow(GoalAllowanceReached);
  });

  it("ignores Billing's older events: an end that overtook its start keeps the allowance restricted", () => {
    const allowance = GoalAllowance.of(grace);
    allowance.restrict(revision(4), now);

    allowance.extend(revision(1), now);

    expect(allowance.pullDomainEvents()).toEqual([]);
    expect(allowance.props).toMatchObject({ unlimited: false, sourceRevision: revision(4) });
  });

  it('changes nothing for the same event twice', () => {
    const allowance = GoalAllowance.of(grace);
    allowance.extend(revision(1), now);
    allowance.pullDomainEvents();

    allowance.extend(revision(1), now);

    expect(allowance.hasChanges()).toBe(false);
  });
});
