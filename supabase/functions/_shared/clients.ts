import { createClient } from 'npm:@supabase/supabase-js@2';

// Service-role client: bypasses RLS for trusted server-side writes
// (booking creation, status updates, waitlist notifications).
export function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

// Resolves the signed-in user from the request's Authorization header.
export async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } }
  );
  const { data: { user } } = await client.auth.getUser();
  return user;
}

// Same as getUser but augments with the profile role (customer | admin).
export async function getUserWithRole(req: Request) {
  const user = await getUser(req);
  if (!user) return null;
  const admin = serviceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  return { ...user, role: profile?.role ?? 'customer' };
}
