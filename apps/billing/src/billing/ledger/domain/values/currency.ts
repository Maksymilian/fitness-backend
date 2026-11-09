import { UnknownCurrency } from '../errors/unknown-currency.js';

/**
 * An ISO 4217 currency the platform takes payments in. Only currencies with two minor units, so
 * that every amount fits NUMERIC(10,2) exactly.
 */
export class Currency {
  static readonly EUR = new Currency('EUR');
  static readonly PLN = new Currency('PLN');
  static readonly USD = new Currency('USD');
  static readonly GBP = new Currency('GBP');
  static readonly #all = [Currency.EUR, Currency.PLN, Currency.USD, Currency.GBP];

  /** Decimal places of the currency's minor unit: cents, grosze, pence. */
  readonly minorUnits = 2;

  private constructor(readonly code: string) {}

  /** From an ISO 4217 code, in any case (Stripe writes `eur`). */
  static from(code: string): Currency {
    const currency = Currency.#all.find((candidate) => candidate.code === code.toUpperCase());
    if (!currency) {
      throw new UnknownCurrency(code);
    }
    return currency;
  }

  equals(other: Currency): boolean {
    return this.code === other.code;
  }

  toString(): string {
    return this.code;
  }
}
