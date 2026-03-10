import { SandboxAgent } from "sandbox-agent";

const sdk = await SandboxAgent.connect({
  baseUrl: "http://127.0.0.1:2468",
});

const session = await sdk.createSession({
  agent: "claude",
  sessionInit: {
    cwd: "/",
    mcpServers: [],
  },
});

console.log(session.id);
