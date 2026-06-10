import { supabase } from '@/lib/supabaseClient';
import { createEntity } from '@/lib/dataEntity';

const profiles = createEntity('profiles');

// Mirrors Base44's `User` entity. `me()` returns the signed-in user's profile
// (id, email, full_name, role) so existing role checks keep working.
export const User = {
  async me() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Not authenticated');

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || '',
      phone: profile?.phone || '',
      role: profile?.role || 'customer'
    };
  },

  async list(orderBy) {
    return profiles.list(orderBy);
  },

  async filter(criteria, orderBy) {
    return profiles.filter(criteria, orderBy);
  },

  async update(id, patch) {
    return profiles.update(id, patch);
  },

  async logout(redirectUrl) {
    await supabase.auth.signOut();
    if (redirectUrl && typeof window !== 'undefined') {
      window.location.href = redirectUrl;
    }
  }
};

export default User;
