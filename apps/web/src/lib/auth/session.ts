import { getPublicClient } from '@repo/shared-data';

export async function requireServerSession() {
  try {
    const supabase = getPublicClient();
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getSupabaseAccessTokenFromSession(): Promise<
  string | undefined
> {
  const session = await requireServerSession();
  return session?.access_token;
}
