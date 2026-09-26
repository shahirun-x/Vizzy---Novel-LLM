import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { STORY_DIRECTOR_MAX_PROMPT_LENGTH, storyDirectorRequestSchema } from "@/lib/story-director-schema";
import { OpenAIStoryDirector } from "@/services/openai-story-director.server";
import { StoryDirectorError } from "@/services/story-director";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = STORY_DIRECTOR_MAX_PROMPT_LENGTH + 4_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestBuckets = new Map<string, { count: number; resetAt: number }>();

function accessCodeRequired() {
  return Boolean(process.env.VERCEL || process.env.VIZZY_AI_ACCESS_CODE);
}
function configuration() {
  const apiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const required = accessCodeRequired();
  const accessConfigured = !required || Boolean(process.env.VIZZY_AI_ACCESS_CODE);
  return {
    apiConfigured,
    accessCodeRequired: required,
    available: apiConfigured && accessConfigured,
    message: !apiConfigured
      ? "Add OPENAI_API_KEY on the server to enable Create with AI. Manual creation remains available."
      : !accessConfigured
        ? "AI creation is disabled until VIZZY_AI_ACCESS_CODE is configured for this deployment."
        : null,
  };
}

function safeCodeMatches(supplied: string | null) {
  if (!accessCodeRequired()) return true;
  const expected = process.env.VIZZY_AI_ACCESS_CODE;
  if (!expected || !supplied) return false;
  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function isRateLimited(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    requestBuckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  return NextResponse.json(configuration(), {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request) {
  const config = configuration();
  if (!config.available) return errorResponse(503, "NOT_CONFIGURED", config.message ?? "AI story creation is unavailable.");
  if (!safeCodeMatches(request.headers.get("x-vizzy-access-code"))) {
    return errorResponse(403, "ACCESS_DENIED", "The AI access code is missing or invalid.");
  }
  if (isRateLimited(request)) {
    return errorResponse(429, "RATE_LIMITED", "Too many story requests. Please wait a minute and retry.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return errorResponse(413, "INVALID_REQUEST", "The story request is too large.");

  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
      return errorResponse(413, "INVALID_REQUEST", "The story request is too large.");
    }
    const parsed = storyDirectorRequestSchema.parse(JSON.parse(body));
    const story = await new OpenAIStoryDirector().generate(parsed, { signal: request.signal });
    return NextResponse.json({ story }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return errorResponse(400, "INVALID_REQUEST", "Review the story prompt and generation options, then try again.");
    }
    if (error instanceof StoryDirectorError) {
      const status = error.code === "CANCELLED" ? 499 : error.code === "RATE_LIMITED" ? 429 : error.code === "INVALID_RESULT" ? 502 : 503;
      return errorResponse(status, error.code, error.message);
    }
    return errorResponse(500, "PROVIDER_FAILURE", "The story service failed safely. Your existing projects are unchanged.");
  }
}
