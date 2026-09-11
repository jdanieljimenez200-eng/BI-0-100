import { EventEmitter } from 'events';

const eventEmitter = new EventEmitter();

export const someEvent = eventEmitter;

export default eventEmitter;