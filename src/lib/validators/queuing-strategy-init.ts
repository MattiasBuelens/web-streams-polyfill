import { QueuingStrategyInit } from '../queuing-strategy';
import { assertDictionary, assertRequiredField, convertUnrestrictedDouble } from './basic';

export function convertQueuingStrategyInit(init: QueuingStrategyInit | null | undefined,
                                           context: string): QueuingStrategyInit {
  assertDictionary(init, context);
  const highWaterMark = init?.highWaterMark;
  assertRequiredField(highWaterMark, 'highWaterMark', 'QueuingStrategyInit');
  return {
    highWaterMark: convertUnrestrictedDouble(highWaterMark)
  };
}
