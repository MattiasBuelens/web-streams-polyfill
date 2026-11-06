import { globals } from './globals.ts';
import { installGlobals } from './install-globals.ts';

// Replace the stream classes in the global scope, even if they exist natively.
installGlobals(globals!);
