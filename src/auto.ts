import { globals } from './globals.ts';
import { installAll } from './feature/index.ts';
import { installGlobals } from './install-globals.ts';

// If the native streams implementation is complete enough, only install the features it's missing.
// Otherwise, replace it entirely, so that one stream graph never mixes two implementations.
if (!installAll(globals!).success) {
  installGlobals(globals!);
}
