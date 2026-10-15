import { getPublicClient } from '@repo/shared-data';

export interface RateAuthUser {
  id: string;
  name: string;
  email: string;
  supabaseAccessToken: string;
}

export async function authenticateWithSupabaseCredentials(credentials?: {
  email?: string;
  password?: string;
}): Promise<RateAuthUser | null> {
  if (!credentials?.email || !credentials?.password) {
    return null;
  }
  try {
    const supabase = getPublicClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(credentials.email).trim(),
      password: String(credentials.password),
    });

    if (error || !data?.user || !data?.session) {
      return null;
    }

    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      data.user.email ??
      'Rate User';

    return {
      id: data.user.id,
      name: fullName,
      email: data.user.email ?? '',
      supabaseAccessToken: data.session.access_token,
    };
  } catch {
    return null;
  }
}

export const nextAuthOptions = {
  session: { strategy: 'jwt' as const },
  authorize: authenticateWithSupabaseCredentials,
};

export default nextAuthOptions;
