import { cookies } from "next/headers";
import { CoworkerLanding } from "@/components/landing/coworker-landing";

export default async function Home() {
  const cookieStore = await cookies();
  const initialHasSession =
    cookieStore.has("__Secure-better-auth.session_token") ||
    cookieStore.has("better-auth.session_token");

  return <CoworkerLanding initialHasSession={initialHasSession} />;
}
