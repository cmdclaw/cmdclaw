import { createRequire } from "node:module";
import { resolve } from "node:path";

globalThis.require = createRequire(resolve(process.cwd(), ".xmcp/http.js"));
