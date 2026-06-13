import { createFileRoute } from "@tanstack/react-router";
import { T } from "gt-react";

/**
 * Support / help-center page. Migrated from previous `src/app/support/page.tsx`.
 * Static metadata moves from the route metadata export to the route `head`.
 * URL is preserved exactly: /support.
 */
export const Route = createFileRoute("/support/")({
  head: () => ({
    meta: [
      { title: "Support - Bap" },
      { name: "description", content: "Get help and support for Bap" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          <T>Support</T>
        </h1>
        <p className="text-muted-foreground">
          <T>For any questions or assistance, please reach out to us via email.</T>
        </p>
      </div>

      <a
        href="mailto:baptiste@heybap.com"
        className="text-primary text-lg font-medium hover:underline"
      >
        <T>baptiste@heybap.com</T>
      </a>
    </div>
  );
}
