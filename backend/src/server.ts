import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { getMatch, MatchUpdate, startSimulator } from "./state";

const app = Fastify({ logger: true });
app.register(cors, { origin: true });
app.register(websocket, {
    options: { maxPayload: 1048576 }
});
// app.register(require('fastify-websocket'));
// ——— Shared broadcast hub (WS + SSE + Long Poll) ———
type Waiter = { since: number; resolve: (update: MatchUpdate) => void; timer: NodeJS.Timeout };
const waiters: Record<string, Waiter[]> = {};
const sseClients: Record<string, Set<NodeJS.WritableStream>> = {};
const wsClients: Record<string, Set<any>> = {};

function notifyAll(update: MatchUpdate) {
  const { matchId } = update;

  // Long-poll waiters
  (waiters[matchId] ?? []).forEach(w => {
    console.log(update.version, w.since)
    if (update.version > w.since) {
      clearTimeout(w.timer);
      w.resolve(update);
    } else {
        console.warn("\nNo update for waiter!\n")
    }
  });
  waiters[matchId] = [];

  // SSE
  (sseClients[matchId] ?? new Set()).forEach((res: any) => {
    res.write(`event: score\n`);
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  });

  // WebSockets
  (wsClients[matchId] ?? new Set()).forEach((ws) => {
    try { ws.send(JSON.stringify(update)); } catch {}
  });
}

// startSimulator("INDvAUS", notifyAll);

app.post("/api/startMatch", async (req, rep) => {
    const { matchId = "INDvAUS" } = (req.body as any) ?? {};
    startSimulator(matchId, notifyAll);
    return { ok: true };
})

// ——— Short Polling ———
// GET /api/score?matchId=INDvAUS
app.get("/api/score", async (req, rep) => {
  const { matchId = "INDvAUS" } = (req.query as any) ?? {};
  return getMatch(matchId);
});

// ——— Long Polling ———
// GET /api/score/long?matchId=INDvAUS&since=42 (times out at 25s)
app.get("/api/score/long", async (req, rep) => {
  const { matchId = "INDvAUS", since = 0 } = (req.query as any) ?? {};
  const current = getMatch(matchId);
  if (current.version > Number(since)) return current;

  return await new Promise<MatchUpdate>((resolve) => {
    const timer = setTimeout(() => {console.log("Timed out so returning latest game state");resolve(getMatch(matchId))}, 25000);
    const w: Waiter = { since: Number(since), resolve, timer };
    waiters[matchId] = waiters[matchId] || [];
    waiters[matchId].push(w);
  });
});

// ——— Server-Sent Events ———
// GET /api/score/sse?matchId=INDvAUS
app.get("/api/score/sse", async (req, rep) => {
  const { matchId = "INDvAUS" } = (req.query as any) ?? {};
  rep.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  rep.raw.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  sseClients[matchId] = sseClients[matchId] ?? new Set();
  sseClients[matchId].add(rep.raw);

  // send latest immediately
  rep.raw.write(`event: score\ndata: ${JSON.stringify(getMatch(matchId))}\n\n`);

  req.raw.on("close", () => {
    sseClients[matchId].delete(rep.raw);
  });
});

// ——— WebSockets (bidirectional) ———
// ws://localhost:3000/ws?matchId=INDvAUS
// app.get("/ws", { websocket: true }, (connection, req) => {
//     const { matchId = "INDvAUS" } = (req.query as any) ?? {};
  
//     wsClients[matchId] = wsClients[matchId] ?? new Set();
//     wsClients[matchId].add(connection.socket); // ✅ this is the real WebSocket

//     console.log("Client connected", Object(connection.socket).toString);
//     // Send current state on connect
//     connection.socket.send(JSON.stringify(getMatch(matchId)));
  
//     connection.socket.on("message", (message) => {
//       console.log("received:", message.toString());
//     });
  
//     connection.socket.on("close", () => {
//       wsClients[matchId].delete(connection.socket);
//     });
//   });

// app.get("/ws", { websocket: true }, (connection /* SocketStream */, req) => {
//     connection.socket.on("message", message => {
//       // Echo the message back
//       connection.socket.send("Echo: " + message);
//     });

//     connection.socket.on('')
//   });
app.register(async function (fastify) {
    fastify.get(
      "/online-status",
      {
        websocket: true,
      },
      (connection, req) => {
        // console.log("state", connection._socket)
        // if (connection.socket.readyState !== connection.socket.OPEN) return;
        connection._socket.on("message", msg => {
          console.log("received:", msg.toString());
          connection.socket.send(`Hello from Fastify. Your message is ${msg}`);
        });
      }
    );
  });

app.get('/hello-ws', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
        connection.socket.send('Hello Fastify WebSockets');
    });
});


const PORT = 3000;
app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`HTTP/SSE/WS/Signaling on http://localhost:${PORT}`);
});
