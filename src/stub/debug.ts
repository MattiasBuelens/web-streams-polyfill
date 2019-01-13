import { noop } from '../utils';

const debug: (name: string) => (message: string) => void = noop as any;
export default debug;
