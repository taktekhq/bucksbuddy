// Feedback: the speech-bubble button next to the Safe on Home files a GitHub
// issue on the user's behalf.
//
// The browser can't talk to GitHub: that needs a token, and a token in a
// client-side bundle is a token everyone has. So this is the same shape as
// delete-account: the client gathers, the `feedback` edge function (which
// holds the token) posts the issue. See supabase/functions/feedback/index.ts.
//
// Binaries never go through the function body. Screenshots, and (only when the
// user deliberately turns it on) a snapshot of their account, are uploaded to
// the private `feedback` storage bucket under `<user id>/<ticket>/`, and the
// function signs those objects into the issue. That keeps the only copy of the
// sensitive attachment somewhere it can actually be deleted again once the bug
// is fixed, which is what the toggle promises.

import { supabase } from "@/lib/supabase";
import { isStandalone } from "@/lib/install";
import type { Currency, CurrencyRate } from "@/lib/currency";
import type { E2EMode } from "@/lib/e2e";
import type { SafeGoldEntry, Transaction } from "@/types/db";

export const FEEDBACK_BUCKET = "feedback";
export const MAX_SCREENSHOTS = 4;
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
export const MAX_MESSAGE_CHARS = 4000;

const DATA_TYPE = "application/json";

// One friendly message for every way this can fail. The real error is reported
// to PostHog by the caller; a user who just wants to report a typo doesn't need
// to read "Edge Function returned a non-2xx status code".
const SEND_FAILED = "Couldn't send that. Check your connection and try again.";

export const SCREENSHOT_ERRORS = {
  notAnImage: "Only PNG, JPEG, WebP, GIF or HEIC images can be attached.",
  tooBig: "Screenshots need to be under 5 MB.",
  tooMany: `Up to ${MAX_SCREENSHOTS} screenshots.`,
} as const;

// Storage keys are ours to choose, so pick the extension from the type rather
// than trusting a filename from the photo library.
//
// This map is also the allow-list, and it is the same one the bucket enforces
// (see supabase/migrations/0012_feedback.sql): a type the bucket would refuse
// should be turned away here, with a reason, rather than dying as a failed
// upload. It deliberately leaves out SVG, which is a script in a trenchcoat.
//
// The file input still asks for `image/*` rather than this list: that is what
// makes iOS open the photo library proper (and quietly hand back JPEG for a
// HEIC shot). The list is what decides afterwards.
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function extensionFor(type: string): string {
  // The fallback is only ever reached by a caller that skipped the allow-list;
  // an extensionless key still signs and still opens.
  return EXTENSIONS[type.toLowerCase()] ?? "img";
}

function isAcceptedImage(type: string): boolean {
  return type.toLowerCase() in EXTENSIONS;
}

/** A short random folder name so two reports from one account never collide. */
function ticketId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(8)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fold newly picked files into the ones already attached, dropping what can't
 * be sent. Returns the new list plus the last complaint, if any, so the sheet
 * can say why a pick was ignored instead of silently swallowing it.
 */
export function addScreenshots(
  current: File[],
  incoming: File[],
): { files: File[]; error: string | null } {
  const files = [...current];
  let error: string | null = null;
  for (const file of incoming) {
    if (!isAcceptedImage(file.type)) {
      error = SCREENSHOT_ERRORS.notAnImage;
    } else if (file.size > MAX_SCREENSHOT_BYTES) {
      error = SCREENSHOT_ERRORS.tooBig;
    } else if (files.length >= MAX_SCREENSHOTS) {
      error = SCREENSHOT_ERRORS.tooMany;
    } else {
      files.push(file);
    }
  }
  return { files, error };
}

// Where the report came from. Non-sensitive and always attached, and it is the
// difference between "the keypad is broken" and a bug someone can reproduce.
export type DeviceInfo = {
  user_agent: string;
  language: string;
  timezone: string;
  viewport: string;
  standalone: boolean;
};

export function deviceInfo(): DeviceInfo {
  return {
    user_agent: navigator.userAgent,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    standalone: isStandalone(),
  };
}

// The account dump behind the "Include my data" toggle: the decrypted rows
// exactly as the app holds them, plus the settings that decide how they're
// read. It is all money, and it only leaves the device when the user
// turns the toggle on and reads what it says.
export type AccountSnapshot = {
  taken_at: string;
  account: { user_id: string; email: string | null };
  settings: {
    home_currency: Currency;
    currencies: CurrencyRate[];
    encryption: E2EMode;
  };
  transactions: Transaction[];
  gold_entries: SafeGoldEntry[];
};

export function accountSnapshot(
  input: {
    userId: string;
    email: string | null;
    homeCurrency: Currency;
    currencies: CurrencyRate[];
    e2eMode: E2EMode;
    transactions: Transaction[];
    goldEntries: SafeGoldEntry[];
  },
  now: Date = new Date(),
): AccountSnapshot {
  return {
    taken_at: now.toISOString(),
    account: { user_id: input.userId, email: input.email },
    settings: {
      home_currency: input.homeCurrency,
      currencies: input.currencies,
      encryption: input.e2eMode,
    },
    transactions: input.transactions,
    gold_entries: input.goldEntries,
  };
}

/**
 * True while the values on screen are the garbled stand-ins. `locked` alone
 * isn't enough: store.unlock() clears it *before* awaiting the reload, so for
 * one window the rows are still masked while locked reads false (same test
 * ExportCard and Receipts use). Attaching then would ship a file of real dates
 * against zeroed amounts, which is worse than attaching nothing.
 */
export function valuesMasked(
  locked: boolean,
  transactions: Transaction[],
  goldEntries: SafeGoldEntry[],
): boolean {
  return (
    locked ||
    transactions.some((t) => t.amountMask != null) ||
    goldEntries.some((g) => g.gramsMask != null)
  );
}

export type FeedbackSubmission = {
  userId: string;
  message: string;
  screenshots: File[];
  /** The account dump, or null when the user left the toggle alone. */
  data: AccountSnapshot | null;
};

/**
 * Upload the attachments, then ask the edge function to file the issue.
 *
 * Uploads that go up for a report that never gets filed are cleaned up here;
 * if the *issue* is what failed, the function removes them with its own
 * credentials, so nothing is left in the bucket either way.
 */
export async function submitFeedback({
  userId,
  message,
  screenshots,
  data,
}: FeedbackSubmission): Promise<{ error: string | null }> {
  const folder = `${userId}/${ticketId()}`;
  const uploaded: string[] = [];

  async function put(path: string, body: Blob, contentType: string): Promise<boolean> {
    const { error } = await supabase.storage
      .from(FEEDBACK_BUCKET)
      .upload(path, body, { contentType, upsert: false });
    if (error) return false;
    uploaded.push(path);
    return true;
  }

  async function abort(): Promise<{ error: string }> {
    // Best effort. An orphan in a private bucket is harmless, but it shouldn't
    // be left behind for a report nobody ever received.
    if (uploaded.length > 0) {
      await supabase.storage.from(FEEDBACK_BUCKET).remove(uploaded);
    }
    return { error: SEND_FAILED };
  }

  for (let i = 0; i < screenshots.length; i++) {
    const file = screenshots[i];
    const path = `${folder}/shot-${i + 1}.${extensionFor(file.type)}`;
    if (!(await put(path, file, file.type))) return abort();
  }
  const shots = [...uploaded];

  let dataPath: string | null = null;
  if (data) {
    dataPath = `${folder}/account-data.json`;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: DATA_TYPE });
    if (!(await put(dataPath, blob, DATA_TYPE))) return abort();
  }

  const { error } = await supabase.functions.invoke("feedback", {
    body: {
      message: message.trim().slice(0, MAX_MESSAGE_CHARS),
      screenshots: shots,
      dataPath,
      device: deviceInfo(),
    },
  });
  if (error) return { error: SEND_FAILED };
  return { error: null };
}
