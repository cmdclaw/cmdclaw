/**
 * Dev startup script for the dedicated WebSocket server shell.
 */

import { startWebSocketServer } from "@bap/core/ws";

const port = parseInt(process.env.WS_PORT || "4097", 10);
startWebSocketServer(port);
