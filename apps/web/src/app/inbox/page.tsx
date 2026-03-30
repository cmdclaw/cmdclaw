"use client";

import { Search } from "lucide-react";
import { useCallback } from "react";
import { InboxAgentFilter } from "@/components/inbox/inbox-agent-filter";
import { InboxCreateInput } from "@/components/inbox/inbox-create-input";
import { InboxList } from "@/components/inbox/inbox-list";
import { useInboxStore } from "@/components/inbox/inbox-store";

export default function InboxPage() {
  const searchQuery = useInboxStore((s) => s.searchQuery);
  const setSearchQuery = useInboxStore((s) => s.setSearchQuery);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  return (
    <div className="bg-background min-h-screen">
      <main className="mx-auto w-full max-w-[960px] px-4 pt-4 pb-16 md:px-8 md:pt-10">
        {/* Search + filters */}
        <div className="mb-5 space-y-3">
          <div className="relative">
            <Search className="text-muted-foreground/50 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search issues..."
              className="bg-background text-foreground placeholder:text-muted-foreground/40 focus:border-ring focus:ring-ring/50 h-9 w-full rounded-lg border pr-3 pl-9 text-sm transition-colors outline-none focus:ring-1"
            />
          </div>
          <InboxAgentFilter />
        </div>

        {/* Create input */}
        <div className="mb-5 rounded-lg border">
          <InboxCreateInput />
        </div>

        {/* List */}
        <InboxList />
      </main>
    </div>
  );
}
