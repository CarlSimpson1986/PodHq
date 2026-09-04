"use client";

import { createClient } from "@supabase/supabase-js";

// The ONE deliberate, narrow exception to "no client-side Supabase calls"
// (CLAUDE.md) — discussed explicitly with Carl, 2026-09-04. Video files are
// too large for a normal API route body (Vercel's serverless request-body
// limit is far smaller than a real video), so the browser has to upload
// directly to Storage using a signed, single-use, server-issued token —
// see src/app/api/exercise-videos/upload-url/route.ts. This file does
// exactly one thing: PUT a file to that pre-authorized signed URL. It never
// queries a table, never uses more than the public anon key (safe to
// expose by design), and isn't a general-purpose "browser Supabase client"
// to reach for anywhere else — if a future feature seems to need one,
// that's a sign to route it through an API route instead, not extend this.
export async function uploadToSignedUrl(path: string, token: string, file: File): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured");
  }

  const client = createClient(url, anonKey);
  const { error } = await client.storage.from("exercise-videos").uploadToSignedUrl(path, token, file);
  if (error) throw error;
}
