DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_avatar_icon') THEN
    CREATE TYPE public.profile_avatar_icon AS ENUM (
      'leaf_svg',
      'spark_svg',
      'drop_svg',
      'sun_svg',
      'casa_png',
      'estrella_png'
    );
  END IF;
END$$;

alter table public.profiles
  add column if not exists profile_alias text;

alter table public.profiles
  add column if not exists avatar_icon_key public.profile_avatar_icon not null default 'leaf_svg';

update public.profiles
set profile_alias = nullif(btrim(profile_alias), '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_alias_length_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_alias_length_check
      CHECK (profile_alias is null or char_length(profile_alias) between 2 and 32);
  END IF;
END$$;
