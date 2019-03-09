import { noop } from '../utils';

const debug: (name: string) => (...message: any[]) => void = () => noop;
export default debug;
