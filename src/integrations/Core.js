import { supabase } from '@/lib/supabaseClient';

// Replaces Base44's Core.SendEmail. Delegates to the `send-email` Supabase
// edge function (which uses Resend). Same call signature as before:
//   SendEmail({ from_name, to, subject, body })
export async function SendEmail({ from_name, to, subject, body }) {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { from_name, to, subject, body }
  });
  if (error) throw error;
  return data;
}

export default { SendEmail };
