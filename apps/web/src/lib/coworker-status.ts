export function getCoworkerRunStatusLabel(status: string): string {
  switch (status) {
    case "awaiting_approval":
      return "Awaiting approval";
    case "awaiting_auth":
      return "Awaiting auth";
    case "paused":
      return "Needs continuation";
    default:
      return status.replaceAll("_", " ");
  }
}
