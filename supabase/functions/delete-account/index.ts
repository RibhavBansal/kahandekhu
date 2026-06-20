// KahanDekhu — account deletion Edge Function
// Deletes the signed-in user's auth account; preferences + watchlist rows
// cascade-delete automatically (they reference auth.users with ON DELETE CASCADE).
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected
// automatically into every Edge Function — you do NOT set them manually.
//
// Deploy:  supabase functions deploy delete-account
// (or via the Supabase dashboard → Edge Functions → New function)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const jwt = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "missing token" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identify the caller strictly from their own JWT.
    const asUser = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: { user }, error: whoErr } = await asUser.auth.getUser();
    if (whoErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Delete the user with the service role. FK cascades remove their data rows.
    const admin = createClient(url, service);
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
