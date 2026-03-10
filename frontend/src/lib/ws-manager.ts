"use client";

/**
 * WebSocket connection manager that uses SharedWorker when available
 * (shares connections across tabs) and falls back to direct WebSocket.
 */

type MessageHandler = (data: string) => void;

let sharedWorkerPort: MessagePort | null = null;
let sharedWorkerSupported: boolean | null = null;
const subscriptions = new Map<string, Set<MessageHandler>>();

// Direct WebSocket fallback state
const directWs = new Map<string, { ws: WebSocket; reconnectTimer?: ReturnType<typeof setTimeout> }>();

function initSharedWorker(): boolean {
  if (sharedWorkerSupported !== null) return sharedWorkerSupported;

  try {
    if (typeof SharedWorker === "undefined") {
      sharedWorkerSupported = false;
      return false;
    }

    const worker = new SharedWorker("/ws-shared-worker.js", { name: "binance-ws" });
    sharedWorkerPort = worker.port;

    worker.port.onmessage = (event) => {
      const { type, stream, payload } = event.data;
      if (type === "data") {
        const handlers = subscriptions.get(stream);
        if (handlers) {
          handlers.forEach((h) => {
            try { h(payload); } catch {}
          });
        }
      }
    };

    worker.port.start();
    sharedWorkerSupported = true;
    return true;
  } catch {
    sharedWorkerSupported = false;
    return false;
  }
}

function connectDirect(stream: string) {
  if (directWs.has(stream)) return;

  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
  const entry = { ws };
  directWs.set(stream, entry);

  ws.onmessage = (event) => {
    const handlers = subscriptions.get(stream);
    if (handlers) {
      handlers.forEach((h) => {
        try { h(event.data); } catch {}
      });
    }
  };

  ws.onerror = () => {};

  ws.onclose = () => {
    directWs.delete(stream);
    const handlers = subscriptions.get(stream);
    if (handlers && handlers.size > 0) {
      // Reconnect
      const timer = setTimeout(() => connectDirect(stream), 3000);
      directWs.set(stream, { ws, reconnectTimer: timer });
    }
  };
}

function disconnectDirect(stream: string) {
  const entry = directWs.get(stream);
  if (!entry) return;
  if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
  try { entry.ws.close(); } catch {}
  directWs.delete(stream);
}

/**
 * Subscribe to a Binance WebSocket stream.
 * Returns an unsubscribe function.
 */
export function subscribe(stream: string, handler: MessageHandler): () => void {
  // Track handler
  if (!subscriptions.has(stream)) {
    subscriptions.set(stream, new Set());
  }
  subscriptions.get(stream)!.add(handler);

  // Use SharedWorker if supported, otherwise direct WebSocket
  const useShared = initSharedWorker();

  if (useShared && sharedWorkerPort) {
    // Only subscribe to worker if this is the first handler for this stream
    if (subscriptions.get(stream)!.size === 1) {
      sharedWorkerPort.postMessage({ type: "subscribe", stream });
    }
  } else {
    if (subscriptions.get(stream)!.size === 1) {
      connectDirect(stream);
    }
  }

  // Return unsubscribe function
  return () => {
    const handlers = subscriptions.get(stream);
    if (!handlers) return;
    handlers.delete(handler);

    if (handlers.size === 0) {
      subscriptions.delete(stream);
      if (useShared && sharedWorkerPort) {
        sharedWorkerPort.postMessage({ type: "unsubscribe", stream });
      } else {
        disconnectDirect(stream);
      }
    }
  };
}
