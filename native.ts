import { IpcMainInvokeEvent } from "electron";
import http from "http";
import { Logger } from "@utils/Logger";

let server: http.Server;
const logger = new Logger("PlaynitePresenceServer");
let currentPort = 38271; // Default port, will be updated by settings

let currentPromiseResolve: ((value: { type: string, payload: any; } | null) => void) | null = null;
let currentPromiseReject: ((reason?: any) => void) | null = null;
let currentPromiseTimeout: NodeJS.Timeout | null = null;

const resolveCurrentPromise = (message: { type: string, payload: any; } | null) => {
  if (currentPromiseResolve) {
    clearTimeout(currentPromiseTimeout!); // Clear the timeout if it exists
    currentPromiseResolve(message);
    currentPromiseResolve = null;
    currentPromiseReject = null;
    currentPromiseTimeout = null;
  }
};

// Function to send a message to the renderer
const sendMessageToRenderer = (type: string, payload: any) => {
  const message = { type, payload };
  resolveCurrentPromise(message);
};

export async function getPendingMessages(_: IpcMainInvokeEvent): Promise<{ type: string, payload: any; } | null> {
  // If there's an existing promise, resolve it with null before creating a new one
  // This handles cases where a new request comes in while the previous one is still pending
  if (currentPromiseResolve) {
    resolveCurrentPromise(null); // Resolve previous promise with null to prevent it from hanging
  }

  return new Promise((resolve, reject) => {
    currentPromiseResolve = resolve;
    currentPromiseReject = reject;

    currentPromiseTimeout = setTimeout(() => {
      if (currentPromiseResolve === resolve) { // Ensure it's still the same pending request
        resolveCurrentPromise(null); // Resolve with null to signal timeout
      }
    }, 30000); // 30 seconds timeout
  });
}


export async function startServer() {
  logger.log("startServer called.");
  if (server?.listening) {
    logger.log("Server is already running.");
    return;
  }

  const host = "127.0.0.1";

  server = http.createServer((req, res) => {
    if (req.method === "POST") {
      let body = "";
      req.on("data", chunk => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          if (req.url === "/set-activity") {
            const data = JSON.parse(body);
            if (data.title !== undefined) {
              logger.log(`Received game: ${data.title}`);
              sendMessageToRenderer("setActivity", data.title);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "ok" }));
            } else {
              throw new Error("Missing 'title' property in /set-activity payload");
            }
          } else if (req.url === "/clear-activity") {
            logger.log("Received clear activity request.");
            sendMessageToRenderer("setActivity", null);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ok" }));
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Endpoint not found" }));
            logger.warn(`Unknown endpoint: ${req.url}`);
          }
        } catch (error: unknown) { // Explicitly type error as unknown
          logger.error(`Error processing request: ${(error as Error).message}`);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Invalid JSON or ${(error as Error).message}` }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(currentPort, host, () => { // Use currentPort here
    logger.log("Server listen callback fired.");
    logger.log(`Server listening on http://${host}:${currentPort}`);
  });

  server.on("error", (err) => {
    logger.error("Server error event fired.");
    logger.error(`Server error: ${err.message}`);
  });
}

export async function stopServer() {
  logger.log("stopServer called.");
  if (server?.listening) {
    server.close(() => {
      logger.log("Server stopped.");
    });
  } else {
    logger.log("Server is not running.");
  }
}

export async function setPortAndRestartServer(_: IpcMainInvokeEvent, newPort: number) {
  logger.log(`Attempting to change port to ${newPort} and restart server.`);
  if (server?.listening) {
    server.close(() => {
      logger.log("Server closed for port change.");
      currentPort = newPort;
      startServer();
    });
  } else {
    currentPort = newPort;
    startServer();
  }
}
