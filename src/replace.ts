import { globals } from './globals';
import { installGlobals } from './install-globals';

// Replace the stream classes in the global scope, even if they exist natively.
installGlobals(globals!);
