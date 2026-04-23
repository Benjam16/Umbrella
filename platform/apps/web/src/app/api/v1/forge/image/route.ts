import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { getServerSupabase } from "@umbrella/runner/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "agent-images";
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB — plenty for a token icon.
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

let bucketEnsured = false;

/**
 * Lazy-create the public `agent-images` bucket on first request. Subsequent
 * uploads short-circuit via the in-process flag. An "already exists" error
 * from Supabase is treated as success.
 */
async function ensureBucket(
  supabase: NonNullable<ReturnType<typeof getServerSupabase>>,
): Promise<void> {
  if (bucketEnsured) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_SIZE,
  });
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(error.message);
  }
  bucketEnsured = true;
}

/**
 * POST /api/v1/forge/image
 *
 * Multipart body: `file` (required) + optional `wallet` for folder scoping.
 * Returns `{ url, path }` where `url` is a public CDN URL the wizard stores
 * on the generated hook row.
 */
export async function POST(request: Request) {
  const supabase = getServerSupabase();
  if (!supabase) {
    return NextResponse.json(
      { error: "storage not configured" },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid multipart body" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "file exceeds 2MB limit" },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "unsupported image type (png, jpeg, webp, gif only)" },
      { status: 415 },
    );
  }

  const walletRaw = form.get("wallet");
  const wallet =
    typeof walletRaw === "string" && /^0x[a-fA-F0-9]{40}$/.test(walletRaw)
      ? walletRaw.toLowerCase()
      : "anon";
  const walletSegment = toSafePathSegment(wallet === "anon" ? wallet : wallet.slice(2));
  const extFromType = file.type.split("/")[1]?.replace(/\+.+$/, "") ?? "png";
  const ext = ["png", "jpeg", "jpg", "webp", "gif"].includes(extFromType)
    ? extFromType === "jpeg"
      ? "jpg"
      : extFromType
    : "png";
  const id = crypto.randomUUID();
  const scopedPath = `${walletSegment}/${id}.${ext}`;
  const flatPath = `${id}.${ext}`;

  try {
    await ensureBucket(supabase);
    const buffer = Buffer.from(await file.arrayBuffer());
    let uploadedPath = scopedPath;
    let { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(uploadedPath, buffer, {
        contentType: file.type,
        upsert: false,
      });
    // Some storage backends/proxies can reject nested object keys. Retry with
    // a flat path so uploads still succeed for the user.
    if (uploadError && /invalid path/i.test(uploadError.message)) {
      uploadedPath = flatPath;
      ({ error: uploadError } = await supabase.storage.from(BUCKET).upload(uploadedPath, buffer, {
        contentType: file.type,
        upsert: false,
      }));
    }
    if (uploadError) throw new Error(uploadError.message);

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(uploadedPath);
    return NextResponse.json({ url: data.publicUrl, path: uploadedPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function toSafePathSegment(input: string): string {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  return cleaned || "anon";
}
