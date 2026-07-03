/**
 * Internal event bus for domain events (MVP).
 * Uses Node.js EventEmitter for in-process event dispatch.
 * Engines subscribe independently — this decouples producers from consumers.
 *
 * For production scale, this can be replaced with BullMQ-based event dispatch
 * without changing the event interface.
 */

import { EventEmitter } from 'node:events';
import { createLogger } from '@crestflow/shared';

const logger = createLogger('event-bus');

class DomainEventBus extends EventEmitter {
  override emit(eventName: string | symbol, ...args: unknown[]): boolean {
    logger.debug({ event: String(eventName) }, 'event emitted');
    return super.emit(eventName, ...args);
  }
}

export const eventBus = new DomainEventBus();

// Increase max listeners to accommodate multiple engine subscribers
eventBus.setMaxListeners(20);
