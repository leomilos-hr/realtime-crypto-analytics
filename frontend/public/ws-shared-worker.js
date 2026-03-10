/**
 * SharedWorker that manages Binance WebSocket connections.
 * Multiple browser tabs share a single WS connection per stream.
 * Falls back gracefully if SharedWorker is not supported.
 */

// Map of streamName -> { ws, ports[] }
const streams = new Map();

// Map of port -> Set<streamName> (subscriptions per tab)
const portSubs = new Map();

function getOrCreateStream(streamName) {
  if (streams.has(streamName)) return streams.get(streamName);

  const entry = { ws: null, ports: new Set(), reconnectTimer: null };
  streams.set(streamName, entry);

  function connect() {
    if (entry.ws) {
      try { entry.ws.close(); } catch {}
    }

    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);
    entry.ws = ws;

    ws.onmessage = (event) => {
      // Broadcast to all subscribed ports
      entry.ports.forEach((port) => {
        try {
          port.postMessage({ type: "data", stream: streamName, payload: event.data });
        } catch {
          // Port might be closed
          entry.ports.delete(port);
        }
      });
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      // Reconnect if there are still subscribers
      if (entry.ports.size > 0) {
        entry.reconnectTimer = setTimeout(connect, 3000);
      } else {
        // No subscribers, clean up
        streams.delete(streamName);
      }
    };
  }

  connect();
  return entry;
}

function removePortFromStream(port, streamName) {
  const entry = streams.get(streamName);
  if (!entry) return;
  entry.ports.delete(port);

  // If no more subscribers, close the WebSocket
  if (entry.ports.size === 0) {
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    if (entry.ws) {
      try { entry.ws.close(); } catch {}
    }
    streams.delete(streamName);
  }
}

// Handle new connections from tabs
self.onconnect = (e) => {
  const port = e.ports[0];
  portSubs.set(port, new Set());

  port.onmessage = (event) => {
    const { type, stream } = event.data;

    if (type === "subscribe") {
      const entry = getOrCreateStream(stream);
      entry.ports.add(port);
      portSubs.get(port).add(stream);
      port.postMessage({ type: "subscribed", stream });
    }

    if (type === "unsubscribe") {
      removePortFromStream(port, stream);
      const subs = portSubs.get(port);
      if (subs) subs.delete(stream);
    }

    if (type === "unsubscribe-all") {
      const subs = portSubs.get(port);
      if (subs) {
        subs.forEach((s) => removePortFromStream(port, s));
        subs.clear();
      }
    }
  };

  // Clean up when tab closes
  port.onmessageerror = () => {
    const subs = portSubs.get(port);
    if (subs) {
      subs.forEach((s) => removePortFromStream(port, s));
    }
    portSubs.delete(port);
  };
};
