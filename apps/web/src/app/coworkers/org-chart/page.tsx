"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { useCoworkerList, useOrgChartNodes } from "@/orpc/hooks";
import { OrgChartCanvas } from "./_components/org-chart-canvas";
import { UnassignedSidebar } from "./_components/unassigned-sidebar";

const EMPTY_COWORKERS: never[] = [];
const EMPTY_NODES: never[] = [];

export default function OrgChartPage() {
  const { data: coworkers, isLoading: loadingCoworkers } = useCoworkerList();
  const { data: chartNodes, isLoading: loadingChart } = useOrgChartNodes();

  const coworkerList = coworkers ?? EMPTY_COWORKERS;
  const nodeList = chartNodes ?? EMPTY_NODES;

  const placedCoworkerIds = useMemo(
    () =>
      new Set(
        nodeList.filter((n) => n.type === "coworker" && n.coworkerId).map((n) => n.coworkerId!),
      ),
    [nodeList],
  );

  const unassigned = useMemo(
    () => coworkerList.filter((c) => !placedCoworkerIds.has(c.id)),
    [coworkerList, placedCoworkerIds],
  );

  if (loadingCoworkers || loadingChart) {
    return (
      <div className="bg-background flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-background flex h-screen w-full">
      <ReactFlowProvider>
        <UnassignedSidebar coworkers={unassigned} />
        <OrgChartCanvas chartNodes={nodeList} coworkers={coworkerList} />
      </ReactFlowProvider>
    </div>
  );
}
