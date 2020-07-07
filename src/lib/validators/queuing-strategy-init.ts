import { QueuingStrategyInit } from '../queuing-strategy';
import { assertDictionary, assertRequiredField, convertUnrestrictedDouble } from './basic';

export function convertQueuingStrategyInit(init: QueuingStrategyInit | undefined,
                                           context = 'The provided value'): QueuingStrategyInit {
  assertDictionary(init, context);
  const highWaterMark = init?.highWaterMark;
  assertRequiredField(highWaterMark, 'highWaterMark', 'QueuingStrategyInit');
  return {
    highWaterMark: convertUnrestrictedDouble(highWaterMark)
  };
}
