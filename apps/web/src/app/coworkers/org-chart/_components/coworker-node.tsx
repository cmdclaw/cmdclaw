"use client";

import { type NodeProps, type Node } from "@xyflow/react";
import {
  InteractiveCoworkerCard,
  type InteractiveCoworkerCardData,
} from "@/components/coworkers/interactive-coworker-card";

export type CoworkerNodeData = InteractiveCoworkerCardData & {
  coworkerId: string;
};

export type CoworkerNodeType = Node<CoworkerNodeData, "coworker">;

export function CoworkerNode({ data }: NodeProps<CoworkerNodeType>) {
  return (
    <InteractiveCoworkerCard
      coworker={data}
      className="w-[280px]"
    />
  );
}
