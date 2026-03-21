import { headers } from "next/headers";
import { CoworkerLanding } from "@/components/landing/coworker-landing";
import { auth } from "@/lib/auth";

export default async function Home() {
  const requestHeaders = await headers();
  const sessionData = await auth.api.getSession({
    headers: requestHeaders,
  });
  const initialHasSession = Boolean(sessionData?.session && sessionData?.user);

  return <CoworkerLanding initialHasSession={initialHasSession} />;
}
