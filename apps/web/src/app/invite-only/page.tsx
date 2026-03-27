import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { InviteOnlyAccessClient } from "@/components/login/invite-only-access-client";
import { auth } from "@/lib/auth";

type InviteOnlyPageProps = {
  searchParams: Promise<{
    email?: string;
    source?: string;
  }>;
};

export default async function InviteOnlyPage({ searchParams }: InviteOnlyPageProps) {
  const params = await searchParams;
  const requestHeaders = await headers();
  const sessionData = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (sessionData?.user?.id) {
    redirect("/chat");
  }

  return <InviteOnlyAccessClient initialEmail={params.email} initialSource={params.source} />;
}
