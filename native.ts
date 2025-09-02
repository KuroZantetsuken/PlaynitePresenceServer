import { IpcMainInvokeEvent } from "electron";
import http from "http";
import { Logger } from "@utils/Logger";
import { createWriteStream, readFileSync, existsSync } from "fs";
import { get } from "https";
import { join } from "path";

let server: http.Server;
const logger = new Logger("PlaynitePresenceServer");
let currentPort = 38271; // Default port, will be updated by settings

let currentPromiseResolve: ((value: { type: string, payload: any; } | null) => void) | null = null;
let currentPromiseReject: ((reason?: any) => void) | null = null;
let currentPromiseTimeout: NodeJS.Timeout | null = null;

interface Detectable {
  id: string;
  name: string;
  executables: {
    name: string;
    os: 'win32' | 'linux' | 'darwin';
  }[];
}

const DB_PATH = join(__dirname, 'detectable.json');

async function updateDetectableDatabase(): Promise<void> {
  logger.log('Fetching latest detectable applications from Discord...');
  return new Promise((resolve, reject) => {
    const file = createWriteStream(DB_PATH);
    get('https://discord.com/api/v9/applications/detectable', (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        logger.log('Detectable database updated successfully.');
        resolve();
      });
    }).on('error', (err) => {
      logger.error('Failed to download detectable database:', err);
      reject(err);
    });
  });
}

async function findAppId({ exeName, gameTitle }: { exeName?: string; gameTitle?: string; }): Promise<string | null> {
  if (!existsSync(DB_PATH)) {
    await updateDetectableDatabase();
  }

  const db: Detectable[] = JSON.parse(readFileSync(DB_PATH, 'utf8'));
  let foundApp: Detectable | undefined;

  if (exeName) {
    const lowerExeName = exeName.toLowerCase();
    foundApp = db.find(app =>
      app.executables?.some(exe => exe.name.toLowerCase() === lowerExeName && exe.os === 'win32')
    );
  }

  if (!foundApp && gameTitle) {
    const lowerGameTitle = gameTitle.toLowerCase();
    foundApp = db.find(app => app.name.toLowerCase() === lowerGameTitle);
  }

  return foundApp ? foundApp.id : null;
}

const resolveCurrentPromise = (message: { type: string, payload: any; } | null) => {
  if (currentPromiseResolve) {
    clearTimeout(currentPromiseTimeout!);
    currentPromiseResolve(message);
    currentPromiseResolve = null;
    currentPromiseReject = null;
    currentPromiseTimeout = null;
  }
};

const sendMessageToRenderer = (type: string, payload: any) => {
  const message = { type, payload };
  resolveCurrentPromise(message);
};

export async function getPendingMessages(_: IpcMainInvokeEvent): Promise<{ type: string, payload: any; } | null> {
  if (currentPromiseResolve) {
    resolveCurrentPromise(null);
  }

  return new Promise((resolve, reject) => {
    currentPromiseResolve = resolve;
    currentPromiseReject = reject;

    currentPromiseTimeout = setTimeout(() => {
      if (currentPromiseResolve === resolve) {
        resolveCurrentPromise(null);
      }
    }, 30000);
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
      req.on("end", async () => {
        try {
          if (req.url === "/set-activity") {
            const data = JSON.parse(body);
            if (data.title !== undefined) {
              logger.log(`Received game: ${data.title}, exe: ${data.exeName}`);
              const appId = await findAppId({ exeName: data.exeName, gameTitle: data.title });
              logger.log(`Found app ID: ${appId}`);
              sendMessageToRenderer("setActivity", { title: data.title, appId: appId });
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "ok", appId: appId }));
            } else {
              throw new Error("Missing 'title' property in /set-activity payload");
            }
          } else if (req.url === "/clear-activity") {
            const data = body ? JSON.parse(body) : {};
            if (data.title) {
              logger.log(`Received clear activity for game: ${data.title}`);
              sendMessageToRenderer("clearActivity", { title: data.title });
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "ok" }));
            } else {
              logger.log("Received legacy clear activity request (no title). Clearing the most recent activity.");
              sendMessageToRenderer("clearActivity", { title: null });
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ status: "ok", note: "Request had no title, cleared most recent activity." }));
            }
          } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Endpoint not found" }));
            logger.warn(`Unknown endpoint: ${req.url}`);
          }
        } catch (error: unknown) {
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

  server.listen(currentPort, host, () => {
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
