import type { ProfileAvatarIconKey } from '../lib/profile-icons';
import { getSupabaseClient } from '../lib/supabase';

export async function updateMyProfileSettings(params: {
  alias: string | null;
  avatarIconKey: ProfileAvatarIconKey;
}): Promise<void> {
  const { alias, avatarIconKey } = params;
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(`No se pudo obtener el usuario autenticado: ${authError.message}`);
  }

  if (!user) {
    throw new Error('No hay sesión activa en Supabase');
  }

  const normalizedAlias = alias?.trim() || null;

  const { error } = await supabase
    .from('profiles')
    .update({
      profile_alias: normalizedAlias,
      avatar_icon_key: avatarIconKey,
    })
    .eq('user_id', user.id);

  if (error) {
    throw new Error(`No se pudo actualizar el perfil: ${error.message}`);
  }
}

export async function createCommunity(name: string): Promise<{ id: string; name: string }> {
  const supabase = getSupabaseClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw new Error(`No se pudo obtener el usuario autenticado: ${authError.message}`);
  }

  if (!user) {
    throw new Error('No hay sesión activa en Supabase');
  }

  const communityName = name.trim();
  if (!communityName) {
    throw new Error('Escribe un nombre para la comunidad.');
  }

  const { data, error } = await supabase
    .from('communities')
    .insert({
      name: communityName,
      created_by: user.id,
    })
    .select('id, name')
    .single();

  if (error) {
    throw new Error(`No se pudo crear la comunidad: ${error.message}`);
  }

  return data;
}
