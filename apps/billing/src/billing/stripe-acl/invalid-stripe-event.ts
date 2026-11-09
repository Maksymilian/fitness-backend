/** A Stripe event that doesn't make sense for Billing: retrying can't fix it. */
export class InvalidStripeEvent extends Error {
  constructor(type: string, reason: string) {
    super(`Invalid ${type}: ${reason}`);
    this.name = 'InvalidStripeEvent';
  }
}
