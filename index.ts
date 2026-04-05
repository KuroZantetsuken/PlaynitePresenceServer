import definePlugin, { PluginNative, OptionType } from "@utils/types";
import { FluxDispatcher, moment } from "@webpack/common";
import { Settings } from "Vencord";
import { Logger } from "@utils/Logger";

let Native: PluginNative<typeof import("./native")>;
const logger = new Logger("PlaynitePresence");

const APP_ID = "0"; // Generic placeholder application ID

let activityStack: { title: string; appId?: string | null; }[] = [];

const updateActivity = () => {
    const currentActivity = activityStack.length > 0 ? activityStack[activityStack.length - 1] : null;
    logger.log(`Updating activity to: ${currentActivity?.title || "null"}`);

    if (currentActivity === null) {
        FluxDispatcher.dispatch({
            type: "LOCAL_ACTIVITY_UPDATE",
            activity: null,
        });
        logger.log("Activity cleared.");
        return;
    }

    const activity = {
        name: currentActivity.title,
        type: 0, // 0 for Playing
        application_id: currentActivity.appId || APP_ID,
    };

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: activity,
    });
    logger.log("setActivity call completed for:", currentActivity.title);
};

const handleSetActivity = (gameInfo: { title: string; appId?: string; }) => {
    if (!gameInfo || !gameInfo.title) {
        logger.log("Ignoring setActivity call with invalid gameInfo.");
        return;
    }
    // Trust the server's state completely
    activityStack = [gameInfo];
    updateActivity();
};

const handleClearActivity = () => {
    activityStack = [];
    updateActivity();
};

let isListening = false; // Flag to control the message listener loop

async function startMessageListener() {
    isListening = true;
    while (isListening) {
        try {
            const message = await Native.getPendingMessages(); // This will long-poll
            if (message) {
                if (message.type === "log") {
                    logger.log(`Native: ${message.payload}`);
                } else if (message.type === "setActivity") {
                    handleSetActivity(message.payload);
                } else if (message.type === "clearActivity") {
                    handleClearActivity();
                }
            }
            // If message is null, it means the long-poll timed out.
            // The loop will continue and make another request.
        } catch (error) {
            logger.error("Error in message listener:", error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

export default definePlugin({
    name: "PlaynitePresence",
    description: "Sets Discord 'Playing' status via local webserver for Playnite.",
    authors: [{ name: "rech", id: 77106595514822656n }],
    version: "1.1.1",

    start() {
        Native = (window as any).VencordNative.pluginHelpers["PlaynitePresence"];

        Native.forceUpdateDatabase();

        const initialPort = parseInt(Settings.plugins?.PlaynitePresence?.port ?? "3000", 10);
        const initialPath = Settings.plugins?.PlaynitePresence?.runningGamesPath ?? "D:\\Scripts\\RunningGames.json";

        Native.setRunningGamesPath(initialPath);
        Native.setPortAndRestartServer(initialPort);

        logger.log("Plugin 1.1.1 started and server instructed to run.");

        startMessageListener(); // Start the long-polling listener
    },

    stop() {
        isListening = false; // Stop the message listener loop
        if (Native?.stopServer) {
            Native.stopServer();
        }

        // Use FluxDispatcher to clear activity on stop
        activityStack = [];
        updateActivity();
        logger.log("Plugin stopped and server instructed to shut down.");
    },

    options: {
        port: {
            description: "Local HTTP server port for Playnite",
            type: OptionType.STRING,
            default: "3000",
            placeholder: "e.g., 3000",
            onChange: (value: string) => {
                const newPort = parseInt(value, 10);
                if (!isNaN(newPort) && newPort > 0 && newPort < 65536) {
                    Native.setPortAndRestartServer(newPort);
                } else {
                    logger.error(`Invalid port number: ${value}`);
                }
            }
        },
        runningGamesPath: {
            description: "Path to the RunningGames.json file",
            type: OptionType.STRING,
            default: "D:\\Scripts\\RunningGames.json",
            placeholder: "e.g., D:\\Scripts\\RunningGames.json",
            onChange: (value: string) => {
                Native.setRunningGamesPath(value);
            }
        }
    }
});