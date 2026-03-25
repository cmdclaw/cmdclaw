import { isSelfHostedEdition } from "@cmdclaw/core/server/edition";
import { trackSignupFromSession } from "@cmdclaw/core/server/services/user-telemetry";
import { db } from "@cmdclaw/db/client";
import { authSchema } from "@cmdclaw/db/schema";
import { autumn } from "autumn-js/better-auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, bearer, lastLoginMethod, magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { env } from "@/env";
import { shouldGrantAdminRole } from "@/lib/admin-emails";
import { buildMagicLinkEmailPayload } from "@/lib/magic-link-email";
import { buildSignInMagicLinkUrl } from "@/lib/magic-link-request";
import { getTrustedOrigins } from "@/lib/trusted-origins";
import { createMagicLinkRequestState } from "@/server/lib/magic-link-request-state";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const appUrl =
  env.APP_URL ?? env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

const socialProviders = isSelfHostedEdition()
  ? {}
  : {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
        ? {
            apple: {
              clientId: env.APPLE_CLIENT_ID,
              clientSecret: env.APPLE_CLIENT_SECRET,
              appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
            },
          }
        : {}),
    };

export const auth = betterAuth({
  appName: "CmdClaw",
  baseURL: appUrl,
  user: {
    additionalFields: {
      phoneNumber: {
        type: "string",
        required: false,
      },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  socialProviders,
  trustedOrigins: getTrustedOrigins(),
  // Don't forget to regenerate the schema if you add a new plugin
  // Run "bun auth:generate" to regenerate the schema
  plugins: [
    nextCookies(),
    bearer(),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
    }),
    lastLoginMethod(),
    ...(!isSelfHostedEdition()
      ? [
          autumn({
            secretKey: env.AUTUMN_SECRET_KEY,
          }),
        ]
      : []),
    magicLink({
      expiresIn: 3600, // 1 hour
      async sendMagicLink({ email, token, url }) {
        console.log(`[auth] Sending magic link to ${email}`);
        await createMagicLinkRequestState({
          token,
          email,
          verificationUrl: url,
        });
        const signInUrl = buildSignInMagicLinkUrl({
          token,
          baseUrl: appUrl,
        });

        if (resend && env.EMAIL_FROM) {
          const emailContent = buildMagicLinkEmailPayload(signInUrl, email);

          await resend.emails.send({
            from: `CmdClaw <${env.EMAIL_FROM}>`,
            to: email,
            subject: `Sign in to CmdClaw | ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
            html: emailContent.html,
            text: emailContent.text,
          });
        } else {
          console.info(`[better-auth] Magic link for ${email}: ${signInUrl}`);
        }
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (shouldGrantAdminRole(user.email)) {
            return { data: { ...user, role: "admin" } };
          }
          return { data: user };
        },
      },
    },
    session: {
      create: {
        after: async (session, context) => {
          try {
            await trackSignupFromSession({ session, context });
          } catch (error) {
            console.error("[auth] failed to emit signup telemetry", error);
            if (error instanceof AggregateError) {
              console.error("[auth] signup telemetry causes", error.errors);
            }
          }
        },
      },
    },
  },
});
