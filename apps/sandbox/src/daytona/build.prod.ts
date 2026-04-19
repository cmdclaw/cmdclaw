import { buildSnapshot } from "./build";

async function main() {
  await buildSnapshot("prod");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
