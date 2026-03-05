import type { ReactElement } from 'react';
import casaPng from '../assets/profile-icons/casa.png';
import estrellaPng from '../assets/profile-icons/estrella.png';

export type ProfileAvatarIconKey =
  | 'leaf_svg'
  | 'spark_svg'
  | 'drop_svg'
  | 'sun_svg'
  | 'casa_png'
  | 'estrella_png';

export interface ProfileIconOption {
  key: ProfileAvatarIconKey;
  label: string;
  format: 'svg' | 'png';
}

export const profileIconOptions: ProfileIconOption[] = [
  { key: 'leaf_svg', label: 'Hoja', format: 'svg' },
  { key: 'spark_svg', label: 'Destello', format: 'svg' },
  { key: 'drop_svg', label: 'Gota', format: 'svg' },
  { key: 'sun_svg', label: 'Sol', format: 'svg' },
  { key: 'casa_png', label: 'Casa', format: 'png' },
  { key: 'estrella_png', label: 'Estrella', format: 'png' },
];

const pngIconMap: Record<ProfileAvatarIconKey, string | null> = {
  leaf_svg: null,
  spark_svg: null,
  drop_svg: null,
  sun_svg: null,
  casa_png: casaPng,
  estrella_png: estrellaPng,
};

const SVG_ICONS: Record<Exclude<ProfileAvatarIconKey, 'casa_png' | 'estrella_png'>, ReactElement> = {
  leaf_svg: (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      <path
        fill="currentColor"
        d="M19.5 4.5c-7 .5-11.5 5-12 12c-.04.6.45 1.1 1.05 1.06c3.63-.22 6.77-1.56 9.07-3.87c2.31-2.3 3.65-5.44 3.88-9.07c.04-.6-.46-1.1-1.06-1.05m-9.33 9.33l4.7-4.7l.7.7l-4.7 4.7z"
      />
    </svg>
  ),
  spark_svg: (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2zm-6 14l1.2 3L10 20l-2.8 1L6 24l-1.2-3L2 20l2.8-1z"
      />
    </svg>
  ),
  drop_svg: (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2c.18 0 .34.08.45.21c1.9 2.2 6.05 7.37 6.05 11.29A6.5 6.5 0 0 1 12 20a6.5 6.5 0 0 1-6.5-6.5c0-3.92 4.15-9.1 6.05-11.29A.6.6 0 0 1 12 2"
      />
    </svg>
  ),
  sun_svg: (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden>
      <path
        fill="currentColor"
        d="M12 6.5A5.5 5.5 0 1 1 6.5 12A5.5 5.5 0 0 1 12 6.5m0-4l1.2 2.4L16 6.1l-2.8 1.2L12 10l-1.2-2.7L8 6.1l2.8-1.2zm0 11A1.5 1.5 0 1 0 13.5 15A1.5 1.5 0 0 0 12 13.5m7-1.5l2.5 1l-2.5 1l-1 2.5l-1-2.5l-2.5-1l2.5-1l1-2.5zm-14 0l1 2.5l2.5 1l-2.5 1l-1 2.5l-1-2.5L2 13l2.5-1z"
      />
    </svg>
  ),
};

export function isValidProfileIconKey(value: string): value is ProfileAvatarIconKey {
  return profileIconOptions.some((option) => option.key === value);
}

export function renderProfileIcon(key: string | null | undefined, className?: string): ReactElement {
  const selected: ProfileAvatarIconKey = key && isValidProfileIconKey(key) ? key : 'leaf_svg';

  if (selected === 'casa_png' || selected === 'estrella_png') {
    const src = pngIconMap[selected];

    return (
      <img
        src={src ?? ''}
        alt=""
        aria-hidden
        className={className ?? 'h-7 w-7 rounded-md object-cover'}
      />
    );
  }

  return <span className={className ?? 'h-7 w-7'}>{SVG_ICONS[selected]}</span>;
}
