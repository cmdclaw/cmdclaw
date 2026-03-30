const TOP_LEVEL_ROUTES = new Set(["chat", "coworker", "auth"]);
const ROOT_PASSTHROUGH_FLAGS = new Set(["--help", "-h", "--version", "-v"]);

export function normalizeCmdclawArgv(argv: string[]): string[] {
  if (argv.length === 0) {
    return ["chat"];
  }

  const first = argv[0];
  if (!first) {
    return ["chat"];
  }

  if (ROOT_PASSTHROUGH_FLAGS.has(first)) {
    return argv;
  }

  if (TOP_LEVEL_ROUTES.has(first)) {
    return argv;
  }

  return ["chat", ...argv];
}
