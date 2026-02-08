import { aj } from "@/lib/arcjet";
import { auth } from "@/lib/auth";
import { findIp } from "@arcjet/ip";
import {
  type ArcjetDecision,
  type BotOptions,
  type EmailOptions,
  type ProtectSignupOptions,
  type SlidingWindowRateLimitOptions,
  detectBot,
  protectSignup,
  slidingWindow,
} from "@arcjet/next";
import { toNextJsHandler } from "better-auth/next-js";
import { NextRequest } from "next/server";

//* CONFIGURATION SETTINGS
const emailOptions = {
  mode: "LIVE",
  deny: ["DISPOSABLE", "INVALID", "NO_MX_RECORDS"],
} satisfies EmailOptions;

const botOptions = {
  mode: "LIVE",
  allow: [], // Blocks all automated clients by default
} satisfies BotOptions;

const restrictiveRateLimitSettings = {
  mode: "LIVE",
  max: 5,
  interval: "10m",
} satisfies SlidingWindowRateLimitOptions<[]>;

const laxRateLimitSettings = {
  mode: "LIVE",
  max: 60,
  interval: "1m",
} satisfies SlidingWindowRateLimitOptions<[]>;

const signupOptions = {
  email: emailOptions,
  bots: botOptions,
  rateLimit: restrictiveRateLimitSettings,
} satisfies ProtectSignupOptions<[]>;

//* PROTECT FUNCTION
async function protect(req: NextRequest): Promise<ArcjetDecision> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  // Use session ID if available, otherwise fallback to IP
  // const userId = session?.user.id ?? (ip(req) || "127.0.0.1");

  let userId: string;
  if (session?.user.id) {
    userId = session.user.id;
  } else {
    userId = findIp(req) || "127.0.0.1"; 
  }


  const isSignupOrReset =
    req.nextUrl.pathname.startsWith("/api/auth/sign-up") ||
    req.nextUrl.pathname.startsWith("/api/auth/request-password-reset");

  if (isSignupOrReset) {
    const body = await req.clone().json();

    if (typeof body.email === "string") {
      return aj
        .withRule(protectSignup(signupOptions))
        .protect(req, { email: body.email, fingerprint: userId });
    }
    
    return aj
      .withRule(detectBot(botOptions))
      .withRule(slidingWindow(restrictiveRateLimitSettings))
      .protect(req, { fingerprint: userId });
  }

  // Generic protection for other auth routes
  return aj
    .withRule(detectBot(botOptions))
    .withRule(slidingWindow(laxRateLimitSettings))
    .protect(req, { fingerprint: userId });
}

const authHandlers = toNextJsHandler(auth.handler);
export const { GET } = authHandlers;

//* CUSTOM POST REQUEST
export const POST = async (req: NextRequest) => {
  const decision = await protect(req);

  if (decision.isDenied()) {
    if (decision.reason.isRateLimit()) {
      return Response.json(
        { message: "Too many requests. Please try again later." },
        { status: 429 },
      );
    } 
    
    if (decision.reason.isEmail()) {
      let message = "Invalid email. Please try another one.";
      const types = decision.reason.emailTypes;

      if (types.includes("INVALID")) {
        message = "Email format is invalid. Check for typos.";
      } else if (types.includes("DISPOSABLE")) {
        message = "Disposable email addresses are not allowed.";
      } else if (types.includes("NO_MX_RECORDS")) {
        message = "Email domain is invalid or has no MX records.";
      }

      return Response.json({ message }, { status: 400 });
    }

    return Response.json({ message: "Access Denied" }, { status: 403 });
  }

  return authHandlers.POST(req);
};
