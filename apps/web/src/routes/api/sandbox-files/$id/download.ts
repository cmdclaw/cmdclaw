import { createFileRoute } from "@tanstack/react-router";
import { downloadSandboxFile } from "@/server/api/sandbox-files/download";

export const Route = createFileRoute("/api/sandbox-files/$id/download")({
  server: {
    handlers: {
      GET: ({ request, params }) => downloadSandboxFile(request, params.id),
    },
  },
});
