import { Decimal } from 'decimal.js';
import { InvalidMoney } from '../errors/invalid-money.js';
import { UnknownCurrency } from '../errors/unknown-currency.js';
import { Currency } from './currency.js';
import { Money } from './money.js';

describe('Money', () => {
  it('keeps amounts exact, where floats would not', () => {
    const sum = new Decimal('0.1').plus('0.2');
    expect(Money.of(sum, Currency.EUR).equals(Money.of('0.3', Currency.EUR))).toBe(true);
  });

  it('converts minor units, as payment providers send them', () => {
    expect(Money.ofMinorUnits(999, Currency.from('eur')).toString()).toBe('9.99 EUR');
    expect(Money.ofMinorUnits(9990, Currency.PLN).toFixed()).toBe('99.90');
  });

  it('is compared by value and currency', () => {
    expect(Money.of('10', Currency.EUR).equals(Money.of('10.00', Currency.EUR))).toBe(true);
    expect(Money.of('10', Currency.EUR).equals(Money.of('10', Currency.PLN))).toBe(false);
  });

  it.each([
    ['9.999', 'more than 2 decimal places'],
    ['100000000', 'too large'],
    ['NaN', 'not an amount'],
    ['ten', 'not an amount'],
  ])('refuses %s: %s', (amount, reason) => {
    expect(() => Money.of(amount, Currency.EUR)).toThrow(InvalidMoney);
    expect(() => Money.of(amount, Currency.EUR)).toThrow(reason);
  });

  it('fits NUMERIC(10,2): the largest amount has eight digits before the point', () => {
    expect(Money.of('99999999.99', Currency.USD).toFixed()).toBe('99999999.99');
  });

  it('refuses minor units that are not a whole number, and currencies without two minor units', () => {
    expect(() => Money.ofMinorUnits(9.5, Currency.EUR)).toThrow(InvalidMoney);
    expect(() => Currency.from('JPY')).toThrow(UnknownCurrency);
  });
});
