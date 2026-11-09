import { InvalidProviderReference } from '../errors/invalid-provider-reference.js';

/**
 * The payment provider's id of what a membership or a ledger entry corresponds to (a Stripe
 * subscription, invoice or refund), kept to recognise it again. Opaque: the model never reads it.
 */
export class ProviderReference {
  private constructor(readonly value: string) {}

  static from(value: string): ProviderReference {
    if (value.length === 0 || value.length > 255 || /\s/.test(value)) {
      throw new InvalidProviderReference(value);
    }
    return new ProviderReference(value);
  }

  equals(other: ProviderReference): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
