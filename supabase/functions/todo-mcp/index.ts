import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleMcp } from "./server.ts";
const project = Deno.env.get("SUPABASE_URL")!,
  publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
// Gateway JWT checking is off: this endpoint validates its own scoped OAuth tokens.
const admin = createClient(
  project,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve((req) =>
  handleMcp(
    req,
    admin,
    (jwt) =>
      createClient(project, publicKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    Deno.env,
  ),
);
