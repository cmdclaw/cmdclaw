import { create } from "zustand";
import type { InboxItem, InboxItemStatus, ToolApprovalData } from "./inbox-mock-data";
import { MOCK_INBOX_ITEMS, MOCK_AGENTS } from "./inbox-mock-data";

type InboxStore = {
  items: InboxItem[];
  expandedIds: Set<string>;
  editingIds: Set<string>;
  agentFilter: string | null;
  searchQuery: string;

  toggleExpanded: (id: string) => void;
  toggleEditing: (id: string) => void;
  setAgentFilter: (agentId: string | null) => void;
  setSearchQuery: (query: string) => void;
  updateStatus: (id: string, status: InboxItemStatus) => void;
  updateToolApproval: (id: string, toolApproval: ToolApprovalData) => void;
  addItem: (title: string, agentId: string) => void;
};

let nextId = MOCK_INBOX_ITEMS.length + 1;

export const useInboxStore = create<InboxStore>((set) => ({
  items: MOCK_INBOX_ITEMS,
  expandedIds: new Set(),
  editingIds: new Set(),
  agentFilter: null,
  searchQuery: "",

  toggleExpanded: (id) =>
    set((state) => {
      const next = new Set(state.expandedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { expandedIds: next };
    }),

  toggleEditing: (id) =>
    set((state) => {
      const next = new Set(state.editingIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { editingIds: next };
    }),

  setAgentFilter: (agentId) => set({ agentFilter: agentId }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  updateStatus: (id, status) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, status, updatedAt: new Date() } : item,
      ),
    })),

  updateToolApproval: (id, toolApproval) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, toolApproval, updatedAt: new Date() } : item,
      ),
      editingIds: (() => {
        const next = new Set(state.editingIds);
        next.delete(id);
        return next;
      })(),
    })),

  addItem: (title, agentId) => {
    const agent = MOCK_AGENTS.find((a) => a.id === agentId);
    if (!agent) {
      return;
    }

    const newItem: InboxItem = {
      id: `inbox-${++nextId}`,
      title,
      status: "running",
      agentName: agent.name,
      agentId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set((state) => ({
      items: [newItem, ...state.items],
    }));
  },
}));
