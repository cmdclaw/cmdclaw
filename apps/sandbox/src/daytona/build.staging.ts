import { buildSnapshot } from "./build";

async function main() {
  await buildSnapshot("staging");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
