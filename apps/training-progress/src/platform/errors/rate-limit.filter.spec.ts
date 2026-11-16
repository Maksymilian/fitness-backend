import type { ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { GraphQLError } from 'graphql';
import { RateLimitFilter } from './rate-limit.filter.js';

describe('RateLimitFilter', () => {
  /** The host of a GraphQL root field: Apollo's context (args[2]) has the request, linked to its response. */
  function graphqlHost(retryAfter: number | undefined): ArgumentsHost {
    const context = { req: { res: { getHeader: (name: string) => (name === 'Retry-After' ? retryAfter : undefined) } } };
    return {
      getType: () => 'graphql',
      getArgs: () => [{}, {}, context, {}],
      getArgByIndex: (index: number) => [{}, {}, context, {}][index],
    } as unknown as ArgumentsHost;
  }

  it('reports the rejection over GraphQL as TOO_MANY_REQUESTS, with when to try again, and answers 429', () => {
    const error = new RateLimitFilter().catch(new ThrottlerException(), graphqlHost(42));

    expect(error).toBeInstanceOf(GraphQLError);
    expect((error as GraphQLError).extensions).toEqual({ code: 'TOO_MANY_REQUESTS', httpStatus: 429, retryAfter: 42, http: { status: 429 } });
  });

  it('leaves out retryAfter when the guard set no Retry-After', () => {
    const error = new RateLimitFilter().catch(new ThrottlerException(), graphqlHost(undefined)) as GraphQLError;

    expect(error.extensions).toEqual({ code: 'TOO_MANY_REQUESTS', httpStatus: 429, http: { status: 429 } });
  });
});
