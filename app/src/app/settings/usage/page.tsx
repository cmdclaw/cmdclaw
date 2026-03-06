"use client";

// TODO: remove mock data once real usage is wired up
const MOCK_USAGE = 400;
const MOCK_LIMIT = 500;
const MOCK_RESET_DAYS = 7;

export default function UsagePage() {
  const usage = MOCK_USAGE;
  const limit = MOCK_LIMIT;
  const resetDays = MOCK_RESET_DAYS;
  const percentage = Math.min((usage / limit) * 100, 100);
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Usage</h2>
        <p className="text-muted-foreground mt-1 text-sm">Track your credits consumption.</p>
      </div>

      <div className="rounded-lg border p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Credits Usage</h3>
          <div className="flex items-baseline gap-1 tabular-nums">
            <span className="text-sm font-semibold">{usage}</span>
            <span className="text-muted-foreground text-sm">/ {limit.toLocaleString()}</span>
          </div>
        </div>

        <div className="mt-3">
          <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-[#B55239]"
              style={{ width: `${Math.max(percentage, 0.5)}%` }}
            />
          </div>
        </div>

        <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
          <span>
            Resets in <span className="font-medium">in {resetDays} days</span> &middot; Upgrade your
            plan to get more credits.
          </span>
          <span className="text-[#B55239]">{Math.round(percentage)}% Used</span>
        </div>
      </div>
    </div>
  );
}
