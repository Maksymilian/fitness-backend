import { Decimal } from 'decimal.js';
import { InvalidMoney } from '../errors/invalid-money.js';
import type { Currency } from './currency.js';

/** Below 100,000,000: the most NUMERIC(10,2) holds. */
const LIMIT = new Decimal('100000000');

/**
 * An amount in a currency, exact: a `decimal.js` decimal, never a float, with no more decimal places
 * than the currency's minor unit and below 100,000,000. Immutable, compared by value.
 */
export class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  /** From a decimal or its text, such as "9.99" (PostgreSQL's NUMERIC comes back as text). */
  static of(amount: Decimal.Value, currency: Currency): Money {
    let value: Decimal;
    try {
      value = new Decimal(amount);
    } catch {
      throw new InvalidMoney(`${String(amount)} is not an amount`);
    }
    if (!value.isFinite()) {
      throw new InvalidMoney(`${String(amount)} is not an amount`);
    }
    if (value.decimalPlaces() > currency.minorUnits) {
      throw new InvalidMoney(`${value.toString()} ${currency.code} has more than ${currency.minorUnits} decimal places`);
    }
    if (value.abs().greaterThanOrEqualTo(LIMIT)) {
      throw new InvalidMoney(`${value.toString()} ${currency.code} is too large`);
    }
    return new Money(value, currency);
  }

  /** From a whole number of minor units, as payment providers send amounts: 999 EUR cents is 9.99 EUR. */
  static ofMinorUnits(minorUnits: number, currency: Currency): Money {
    if (!Number.isSafeInteger(minorUnits)) {
      throw new InvalidMoney(`${minorUnits} is not a whole number of minor units`);
    }
    return Money.of(new Decimal(minorUnits).dividedBy(10 ** currency.minorUnits), currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  equals(other: Money): boolean {
    return this.currency.equals(other.currency) && this.amount.equals(other.amount);
  }

  /** The amount with exactly the currency's decimal places: "9.99", "10.00". */
  toFixed(): string {
    return this.amount.toFixed(this.currency.minorUnits);
  }

  toString(): string {
    return `${this.toFixed()} ${this.currency.code}`;
  }
}
