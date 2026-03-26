/**
 * Generic typed event bus with channel-based pub/sub.
 *
 * `TEventMap` maps channel names to their payload types, giving compile-time
 * safety to both emitters and subscribers.
 */

type Handler<T> = (payload: T) => void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- must match TypedEventBus generic constraint
type AnyHandler<TEventMap extends Record<string, any>> = (
  channel: keyof TEventMap,
  payload: TEventMap[keyof TEventMap],
) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- broad constraint allows interfaces without index signatures
export class TypedEventBus<TEventMap extends Record<string, any>> {
  private readonly listeners = new Map<keyof TEventMap, Set<Handler<never>>>();
  private readonly anyListeners = new Set<AnyHandler<TEventMap>>();

  /** Subscribe to a specific channel. */
  on<K extends keyof TEventMap>(channel: K, handler: Handler<TEventMap[K]>): void {
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(handler as Handler<never>);
  }

  /** Unsubscribe a handler from a specific channel. */
  off<K extends keyof TEventMap>(channel: K, handler: Handler<TEventMap[K]>): void {
    this.listeners.get(channel)?.delete(handler as Handler<never>);
  }

  /** Subscribe to a channel for a single emission, then auto-unsubscribe. */
  once<K extends keyof TEventMap>(channel: K, handler: Handler<TEventMap[K]>): void {
    const wrapper: Handler<TEventMap[K]> = (payload) => {
      this.off(channel, wrapper);
      handler(payload);
    };
    this.on(channel, wrapper);
  }

  /** Subscribe to all channels. Useful for SSE broadcasting or logging. */
  onAny(handler: AnyHandler<TEventMap>): void {
    this.anyListeners.add(handler);
  }

  /** Unsubscribe a wildcard handler. */
  offAny(handler: AnyHandler<TEventMap>): void {
    this.anyListeners.delete(handler);
  }

  /** Synchronously emit a payload to all handlers on the given channel. */
  emit<K extends keyof TEventMap>(channel: K, payload: TEventMap[K]): void {
    const set = this.listeners.get(channel);
    if (set) {
      for (const handler of set) {
        (handler as Handler<TEventMap[K]>)(payload);
      }
    }
    for (const handler of this.anyListeners) {
      handler(channel, payload);
    }
  }

  /** Remove all listeners and reset the bus. */
  destroy(): void {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}
