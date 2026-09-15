// BucksBuddy: feedback edge function.
//
// Files a GitHub issue on behalf of the signed-in user (Home → the speech
// bubble next to the Safe → the Feedback screen). GitHub needs a token, and a
// token in a client-side bundle is a token everyone has — so, exactly like
// delete-account, the browser sends its session JWT and this function does the
// privileged part.
//
// The client has already uploaded any attachments to the private `feedback`
// bucket under `<user id>/<ticket>/` (see supabase/migrations/0009_feedback.sql
// and src/lib/feedback.ts). This function signs those objects into the issue —
// binaries never travel through the request body.
//
// Deploy (Supabase Dashboard → Edge Functions → Deploy a new function → Via
// Editor): name it exactly `feedback`, paste this file, Deploy. Keep "Verify
// JWT" enabled. Or, via CLI: `supabase functions deploy feedback`.
//
// Secrets to set once (Dashboard → Edge Functions → Secrets, or
// `supabase secrets set …`):
//   GITHUB_TOKEN  a fine-grained PAT scoped to the one repo, with
//                 Repository permissions → Issues: Read and write. Nothing else.
//   GITHUB_REPO   "owner/name", e.g. "taktekhq/bucksbuddy".
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by
// the platform.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "feedback";
// Long enough that a bug filed today is still legible when it's picked up, and
// short enough that a link in an old issue eventually stops working.
const SIGNED_URL_SECONDS = 60 * 60 * 24 * 365;
const MAX_MESSAGE_CHARS = 4000;
const MAX_SCREENSHOTS = 4;
// One person, one day. Enough for a bad afternoon with the app; not enough to
// turn the issue tracker into a firehose.
const DAILY_LIMIT = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Device = Record<string, unknown>;

/** The report's message, quoted so it can't be mistaken for our own prose. */
function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

/** First non-empty line, trimmed to something that fits an issue title. */
function titleFor(message: string): string {
  const line = message.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const short = line.length > 72 ? `${line.slice(0, 69)}…` : line;
  return `Feedback: ${short || "(no summary)"}`;
}

function deviceTable(device: Device): string {
  const rows = Object.entries(device)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    // Pipes in a user agent would break the table; there are none in practice,
    // but escape anyway rather than trust it.
    .map(([k, v]) => `| ${k} | ${String(v).replaceAll("|", "\\|")} |`);
  if (rows.length === 0) return "";
  return ["| | |", "| --- | --- |", ...rows].join("\n");
}

Deno.serve(async (req) => {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  const repo = Deno.env.get("GITHUB_REPO");

  const admin = createClient(url, serviceKey);
  // Set once we know which objects this report owns, so every failure path
  // below can clear them out instead of leaving them in the bucket.
  let orphans: string[] = [];

  async function discard() {
    if (orphans.length > 0) await admin.storage.from(BUCKET).remove(orphans);
  }

  try {
    if (!githubToken || !repo) {
      return json({ error: "Feedback is not configured on this server." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    // Identify the caller from their JWT — never trust an id from the body.
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userErr,
    } = await caller.auth.getUser();
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Bad request" }, 400);
    }
    const {
      message,
      screenshots = [],
      dataPath = null,
      device = {},
    } = body as {
      message?: unknown;
      screenshots?: unknown;
      dataPath?: unknown;
      device?: unknown;
    };

    const text = typeof message === "string" ? message.trim() : "";
    if (!text) return json({ error: "Say something first." }, 400);
    if (text.length > MAX_MESSAGE_CHARS) {
      return json({ error: "That message is too long." }, 400);
    }

    const shots = Array.isArray(screenshots) ? screenshots.filter((p) => typeof p === "string") : [];
    if (shots.length > MAX_SCREENSHOTS) {
      return json({ error: "Too many screenshots." }, 400);
    }
    const dataObject = typeof dataPath === "string" ? dataPath : null;

    // Every attachment must sit inside the caller's own folder. The storage
    // policy already enforces this on upload; re-check it here so a crafted
    // request can't have us sign somebody else's object into an issue.
    const prefix = `${user.id}/`;
    const paths = [...shots, ...(dataObject ? [dataObject] : [])];
    if (paths.some((p) => !p.startsWith(prefix) || p.includes(".."))) {
      return json({ error: "Bad attachment path." }, 400);
    }
    orphans = paths;

    // Rate limit, per account per day.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("feedback_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      await discard();
      return json({ error: "That's a lot of feedback for one day. Try tomorrow." }, 429);
    }

    // Sign the attachments. A path that won't sign (never uploaded, already
    // swept) is left out rather than failing the whole report.
    async function sign(path: string): Promise<string | null> {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS);
      return error ? null : (data?.signedUrl ?? null);
    }

    const shotLinks: string[] = [];
    for (const path of shots) {
      const signed = await sign(path);
      const name = path.split("/").pop();
      // Linked image: it renders inline where the format allows, and is still a
      // working link when it doesn't (HEIC straight off an iPhone, say).
      if (signed) shotLinks.push(`[![${name}](${signed})](${signed})`);
    }
    const dataLink = dataObject ? await sign(dataObject) : null;
    const folder = paths.length > 0 ? paths[0].split("/").slice(0, 2).join("/") : null;

    const parts: string[] = [
      `**From:** ${user.email ?? "no email on the account"} · \`${user.id}\``,
      `**Sent:** ${new Date().toISOString()}`,
      "",
      quote(text),
    ];

    if (shotLinks.length > 0) {
      parts.push("", "### Screenshots", "", shotLinks.join("\n\n"));
    }

    if (dataLink) {
      parts.push(
        "",
        "### Account data",
        "",
        "The reporter switched on **Include my data**, so this report carries a",
        "dump of their entries in the clear — for an end-to-end encrypted account,",
        "that is data the server otherwise cannot read at all.",
        "",
        `[account-data.json](${dataLink})`,
        "",
        "> **Delete it when this is fixed.** The app told them it would be:",
        `> storage bucket \`${BUCKET}\`, folder \`${folder}\`.`,
      );
    }

    const table = deviceTable(device as Device);
    if (table) parts.push("", "### Device", "", table);

    parts.push(
      "",
      "---",
      "_Filed from inside the app by the Feedback screen._",
    );

    const issue = {
      title: titleFor(text),
      body: parts.join("\n"),
      labels: dataLink ? ["feedback", "has-user-data"] : ["feedback"],
    };

    async function file(payload: Record<string, unknown>): Promise<Response> {
      return await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "bucksbuddy-feedback",
        },
        body: JSON.stringify(payload),
      });
    }

    let res = await file(issue);
    if (res.status === 422) {
      // Almost always a label the repo doesn't have and the token may not be
      // allowed to create. The report matters more than the label.
      const { labels: _labels, ...bare } = issue;
      res = await file(bare);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("GitHub issue creation failed", res.status, detail.slice(0, 500));
      await discard();
      return json({ error: "Couldn't file the issue." }, 502);
    }

    const created = (await res.json()) as { number?: number };

    // Log it: the rate limit counts these, and the row says which storage
    // folder to delete when the issue is closed.
    await admin.from("feedback_reports").insert({
      user_id: user.id,
      issue_number: created.number ?? null,
      storage_prefix: folder,
      shared_data: dataLink != null,
    });

    return json({ ok: true, number: created.number ?? null }, 200);
  } catch (e) {
    await discard().catch(() => {});
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
