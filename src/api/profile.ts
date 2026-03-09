import type { ProfileAvatarIconKey } from '../lib/profile-icons';
import { getSupabaseClient } from '../lib/supabase';

function normalizeAvatarColor(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!/^#([0-9a-fA-F]{6})$/.test(normalized)) {
    throw new Error('El color del perfil debe estar en formato HEX, por ejemplo #8b6a52.');
  }

  return normalized.toLowerCase();
}

export async function updateMyProfileSettings(params: {
  alias: string | null;
  avatarIconKey: ProfileAvatarIconKey;
  avatarColor: string;
}): Promise<void> {
  const { alias, avatarIconKey, avatarColor } = params;
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
  const normalizedAvatarColor = normalizeAvatarColor(avatarColor);

  const { error } = await supabase
    .from('profiles')
    .update({
      profile_alias: normalizedAlias,
      avatar_icon_key: avatarIconKey,
      avatar_color: normalizedAvatarColor,
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
    .rpc('rpc_create_community', {
      p_name: communityName,
    })
    .single();

  if (error) {
    throw new Error(`No se pudo crear la comunidad: ${error.message}`);
  }

  return {
    id: String((data as { id: string; name: string }).id),
    name: String((data as { id: string; name: string }).name),
  };
}

export async function deleteCommunity(communityId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const normalizedCommunityId = communityId.trim();

  if (!normalizedCommunityId) {
    throw new Error('No se encontró una comunidad para eliminar.');
  }

  const { error } = await supabase.from('communities').delete().eq('id', normalizedCommunityId);

  if (error) {
    throw new Error(`No se pudo eliminar la comunidad: ${error.message}`);
  }
}
