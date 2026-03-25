const target = process.argv[2];

if (!target) {
  console.error("Usage: bun run cat <path>");
  process.exit(1);
}

const file = Bun.file(target);
if (!(await file.exists())) {
  console.error(`File not found: ${target}`);
  process.exit(1);
}

process.stdout.write(await file.text());
