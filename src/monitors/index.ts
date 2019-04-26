import { MonitorFactory } from '../types';

export default [
	require('./waitingpods').default,
	require('./longnotready').default,
	require('./metrics').default,
	require('./readypods').default
] as MonitorFactory[];
