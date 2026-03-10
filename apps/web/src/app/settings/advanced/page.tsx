import { isSelfHostedEdition } from "@cmdclaw/core/server/edition";
import { redirect } from "next/navigation";

export default function AdvancedSettingsPage() {
  redirect(isSelfHostedEdition() ? "/instance" : "/admin");
}
