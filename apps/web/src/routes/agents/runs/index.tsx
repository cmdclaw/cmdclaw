import { createFileRoute } from "@tanstack/react-router";
import { T } from "gt-react";

export const Route = createFileRoute("/agents/runs/")({
  head: () => ({ meta: [{ title: "Coworker Runs" }] }),
  component: CoworkerRunsIndexPage,
});

function CoworkerRunsIndexPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 items-center border-b px-3 sm:px-4">
        <span className="text-sm font-medium">
          <T>Coworker runs</T>
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center">
          <h2 className="text-lg font-semibold">
            <T>Select a coworker run</T>
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            <T>Open a run from the recent runs list or a coworker page to view it here.</T>
          </p>
        </div>
      </div>
    </div>
  );
}
