import { noop } from '../utils';

const debug: (name: string) => (...message: any[]) => void = noop as any;
export default debug;
