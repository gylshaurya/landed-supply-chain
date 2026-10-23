import { EventEmitter } from 'node:events';

/** In-process event bus that feeds the server-sent-events stream. */
export const bus = new EventEmitter();
bus.setMaxListeners(100);
