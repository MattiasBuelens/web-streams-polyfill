import { checkCore } from './core';
import * as asyncIterator from './async-iterator';
import * as readableStreamFrom from './readable-stream-from';
import { getGlobals, type StreamClasses } from './types';

export { checkCore };
export type { StreamClasses };

/**
 * A feature that can be installed on top of a native streams implementation.
 *
 * @public
 */
export interface Feature {
  readonly name: string;

  check(classes?: StreamClasses): boolean;

  install(classes?: StreamClasses): boolean;
}

/**
 * All features, in the order in which {@link installAll} installs them.
 *
 * @public
 */
export const features: readonly Feature[] = [
  readableStreamFrom,
  asyncIterator
];

/**
 * The result of {@link installAll}.
 *
 * @public
 */
export interface InstallReport {
  /**
   * Whether the classes passed {@link checkCore}. If not, no features were installed.
   */
  success: boolean;
  /**
   * The names of the features that were installed by this call.
   */
  installed: string[];
}

/**
 * Installs every feature that the given classes are missing.
 *
 * This only installs features on top of a native implementation that passes {@link checkCore}.
 * Otherwise, it does nothing, so that one stream graph never mixes two implementations.
 *
 * @public
 */
export function installAll(classes: StreamClasses = getGlobals()): InstallReport {
  const installed: string[] = [];
  if (!checkCore(classes)) {
    return { success: false, installed };
  }
  for (const feature of features) {
    if (feature.install(classes)) {
      installed.push(feature.name);
    }
  }
  return { success: true, installed };
}
