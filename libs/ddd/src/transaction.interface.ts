/**
 * An open database transaction, opaque to the domain and the application layer. A repository
 * saves an aggregate through it, and the outbox adds the aggregate's events to it, so both
 * commit or roll back together.
 */
export interface Transaction {
  // A brand only: it keeps other objects from passing as a Transaction; no value carries it.
  readonly transactionBrand: 'Transaction';
}
