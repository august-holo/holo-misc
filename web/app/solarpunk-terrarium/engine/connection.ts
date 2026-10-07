// The socket to the server: decompresses what arrives, and keeps trying when it drops.

import { PROTOCOL, type FrameMessage, type WorldMessage } from "./view";

export type Status =
  | "connecting"
  | "live"
  /** The connection dropped, or the server is restarting. */
  | "reconnecting"
  /** Every place is taken. */
  | "full"
  /** Too many connections from this address. */
  | "crowded"
  /** The server speaks a newer protocol than this page; it needs reloading. */
  | "outdated";

export interface Handlers {
  world(m: WorldMessage): void;
  frame(m: FrameMessage): void;
  status(s: Status): void;
}

const CLOSE_FULL = 4001;
const CLOSE_TOO_MANY = 4002;
const RETRY_SECONDS = [1, 2, 4, 8, 15];
const RETRY_WHEN_REFUSED = 15;

function address() {
  // The development server does not pass sockets through, so go to the backend directly.
  if (process.env.NODE_ENV === "development")
    return "ws://127.0.0.1:8080/api/solarpunk-terrarium/ws";
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/api/solarpunk-terrarium/ws`;
}

async function inflate(data: ArrayBuffer) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Response(stream).text();
}

export function connect(handlers: Handlers) {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let closed = false;

  function open() {
    handlers.status(failures ? "reconnecting" : "connecting");
    const ws = new WebSocket(address());
    ws.binaryType = "arraybuffer";
    socket = ws;
    // Decompression is asynchronous; this keeps messages in the order they arrived.
    let queue = Promise.resolve();

    ws.onmessage = (event) => {
      queue = queue
        .then(() => inflate(event.data))
        .then((text) => {
          if (socket !== ws) return;
          const m = JSON.parse(text) as WorldMessage | FrameMessage;
          if (m.type === "frame") return handlers.frame(m);
          if (m.v !== PROTOCOL) {
            handlers.status("outdated");
            close();
            return;
          }
          failures = 0;
          handlers.status("live");
          handlers.world(m);
        })
        .catch(() => ws.close());
    };

    ws.onclose = (event) => {
      if (socket !== ws || closed) return;
      socket = null;
      const refused = event.code === CLOSE_FULL || event.code === CLOSE_TOO_MANY;
      if (event.code === CLOSE_FULL) handlers.status("full");
      else if (event.code === CLOSE_TOO_MANY) handlers.status("crowded");
      else handlers.status("reconnecting");
      const wait = refused
        ? RETRY_WHEN_REFUSED
        : RETRY_SECONDS[Math.min(failures, RETRY_SECONDS.length - 1)];
      failures++;
      retry = setTimeout(open, (wait + Math.random()) * 1000);
    };
  }

  function close() {
    closed = true;
    if (retry) clearTimeout(retry);
    socket?.close();
    socket = null;
  }

  open();
  return { close };
}
