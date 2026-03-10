import {
  useCallback,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  acceptCommunityInviteByToken,
  createCommunityInviteLink,
  fetchCommunityDashboard,
} from './api/community';
import { createCommunity, deleteCommunity, updateMyProfileSettings } from './api/profile';
import {
  createCommunityTask,
  createTaskCategory,
  createTaskLog,
  deleteTaskLog,
  deactivateCommunityTask,
  fetchCommunityTasks,
  fetchMyRecentTaskLogs,
  fetchTaskCategories,
  type CommunityTask as ApiCommunityTask,
  type RecentTaskLog as ApiRecentTaskLog,
} from './api/tasks';
import {
  isValidProfileIconKey,
  profileIconOptions,
  renderProfileIcon,
  type ProfileAvatarIconKey,
} from './lib/profile-icons';
import { getSupabaseClient, isSupabaseConfigured } from './lib/supabase';
import type { ActivityRange, MemberName, UserCommunitySummary, WeeklyActivity } from './types/community';

type DailyOverviewRow = WeeklyActivity & { total: number; totalPoints: number; mobileDayLabel: string };

type CommunityTask = ApiCommunityTask;
type RecentTaskLog = ApiRecentTaskLog;
const EMPTY_TASKS: CommunityTask[] = [];
const EMPTY_CATEGORIES: string[] = [];
const activityRangeOptions: { value: ActivityRange; label: string }[] = [
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
];
const THEME_STORAGE_KEY = 'nuestrohogar:theme-mode:v1';
const THEME_TRANSITION_MS = 220;
const DEFAULT_PROFILE_COLOR = '#8b6a52';

type ToastVariant = 'success' | 'error';
type ThemeMode = 'light' | 'dark' | 'system';
type ThemeTransitionOrigin = { x: number; y: number };

interface AppToast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface TaskDropdownOption {
  value: string;
  label: string;
  hint?: string;
  chip?: string;
  disabled?: boolean;
}

interface TaskDropdownProps {
  ariaLabel: string;
  disabled?: boolean;
  emptyLabel?: string;
  icon: ReactNode;
  onChange: (value: string) => void;
  options: TaskDropdownOption[];
  placeholder: string;
  selectedChip?: ReactNode;
  value: string;
  variant?: 'default' | 'score';
}

interface DailyChartTooltipPayloadItem {
  payload?: DailyOverviewRow;
}

interface DailyChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: DailyChartTooltipPayloadItem[];
}

interface DonutChartDatum {
  color: string;
  name: string;
  value: number;
}

interface DonutChartTooltipPayloadItem {
  payload?: DonutChartDatum;
}

interface DonutChartTooltipProps {
  active?: boolean;
  payload?: DonutChartTooltipPayloadItem[];
}

interface ChartLegendPayloadItem {
  color?: string;
  value?: string;
}

interface ChartLegendProps {
  payload?: ChartLegendPayloadItem[];
}

type AuthMode = 'sign-in' | 'sign-up';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

function getInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const weekdayMap: Record<string, string> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

const getScoreBadgeClass = (score: number) =>
  score <= 3
    ? 'border-amber-200 bg-amber-100 text-amber-800'
    : score <= 5
      ? 'border-orange-200 bg-orange-100 text-orange-800'
      : 'border-lime-200 bg-lime-100 text-lime-800';

function getPointsKey(memberName: string): string {
  return `${memberName}__points`;
}

function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{6})$/.test(value);
}

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!isHexColor(withHash)) {
    return null;
  }

  return withHash.toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return null;
  }

  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta > 0) {
    if (max === red) {
      hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
    } else if (max === green) {
      hue = ((blue - red) / delta + 2) * 60;
    } else {
      hue = ((red - green) / delta + 4) * 60;
    }
  }

  const saturation = max === 0 ? 0 : delta / max;
  return {
    h: hue,
    s: saturation,
    v: max,
  };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = value - chroma;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hue < 60) {
    rPrime = chroma;
    gPrime = x;
  } else if (hue < 120) {
    rPrime = x;
    gPrime = chroma;
  } else if (hue < 180) {
    gPrime = chroma;
    bPrime = x;
  } else if (hue < 240) {
    gPrime = x;
    bPrime = chroma;
  } else if (hue < 300) {
    rPrime = x;
    bPrime = chroma;
  } else {
    rPrime = chroma;
    bPrime = x;
  }

  return {
    r: (rPrime + m) * 255,
    g: (gPrime + m) * 255,
    b: (bPrime + m) * 255,
  };
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function toMobileDayLabel(metricDate: string): string {
  const [year, month, day] = metricDate.split('-').map(Number);
  if (!year || !month || !day) {
    return metricDate;
  }

  return `${day}-${month}`;
}

function getFriendlyAuthErrorMessage(authError: unknown, authMode: AuthMode) {
  const fallbackMessage =
    authMode === 'sign-up' ? 'No se pudo crear la cuenta.' : 'No se pudo iniciar sesión.';

  const rawMessage = authError instanceof Error ? authError.message : '';
  if (!rawMessage) {
    return fallbackMessage;
  }

  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('email address') &&
    normalized.includes('is invalid')
  ) {
    return 'Supabase rechazó el correo para registro. Revisa Auth > SMTP en Supabase (dominios autorizados/proveedor) y vuelve a intentar.';
  }

  if (
    normalized.includes('over_email_send_rate_limit') ||
    normalized.includes('email rate limit exceeded')
  ) {
    return 'Se alcanzó el límite de correos de verificación en Supabase. Espera unos minutos o configura SMTP propio en Auth > SMTP.';
  }

  return rawMessage;
}

function getEnabledOptionIndex(
  options: TaskDropdownOption[],
  startIndex: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) {
    return -1;
  }

  let nextIndex = startIndex;
  for (let step = 0; step < options.length; step += 1) {
    nextIndex = (nextIndex + direction + options.length) % options.length;
    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return -1;
}

function TaskDropdown({
  ariaLabel,
  disabled = false,
  emptyLabel = 'Sin opciones disponibles',
  icon,
  onChange,
  options,
  placeholder,
  selectedChip,
  value,
  variant = 'default',
}: TaskDropdownProps) {
  const dropdownId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shouldSkipOptionClickRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sortedOptions = useMemo(
    () =>
      [...options].sort((optionA, optionB) => {
        const isOptionAAll = optionA.label.trim().toLocaleLowerCase('es') === 'todas';
        const isOptionBAll = optionB.label.trim().toLocaleLowerCase('es') === 'todas';

        if (isOptionAAll && !isOptionBAll) {
          return -1;
        }

        if (!isOptionAAll && isOptionBAll) {
          return 1;
        }

        return optionA.label.localeCompare(optionB.label, 'es', {
          numeric: true,
          sensitivity: 'base',
        });
      }),
    [options],
  );

  const selectedIndex = sortedOptions.findIndex(
    (option) => option.value === value && !option.disabled,
  );
  const selectedOption = selectedIndex >= 0 ? sortedOptions[selectedIndex] : null;
  const firstEnabledIndex = useMemo(
    () => sortedOptions.findIndex((option) => !option.disabled),
    [sortedOptions],
  );
  const lastEnabledIndex = useMemo(() => {
    for (let index = sortedOptions.length - 1; index >= 0; index -= 1) {
      if (!sortedOptions[index]?.disabled) {
        return index;
      }
    }
    return -1;
  }, [sortedOptions]);
  const isDisabled = disabled || firstEnabledIndex === -1;

  useEffect(() => {
    if (isDisabled && isOpen) {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }, [isDisabled, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return;
    }

    const optionNode = optionRefs.current[activeIndex];
    if (!optionNode) {
      return;
    }

    window.requestAnimationFrame(() => {
      optionNode.focus({ preventScroll: true });
      optionNode.scrollIntoView({ block: 'nearest' });
    });
  }, [activeIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setIsOpen(false);
    setActiveIndex(-1);
  }, [value]);

  const closeDropdown = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const focusTrigger = () => {
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  const openDropdown = (preferredIndex?: number) => {
    if (isDisabled) {
      return;
    }

    const fallbackIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex;
    const nextIndex =
      preferredIndex !== undefined && preferredIndex >= 0 ? preferredIndex : fallbackIndex;

    setActiveIndex(nextIndex);
    setIsOpen(true);
  };

  const commitSelection = (index: number) => {
    const nextOption = sortedOptions[index];
    if (!nextOption || nextOption.disabled) {
      return;
    }

    closeDropdown();
    onChange(nextOption.value);
    focusTrigger();
  };

  const handleOptionTouchEnd = (event: ReactTouchEvent<HTMLButtonElement>, index: number) => {
    const nextOption = sortedOptions[index];
    if (!nextOption || nextOption.disabled) {
      return;
    }

    shouldSkipOptionClickRef.current = true;
    event.preventDefault();
    event.stopPropagation();
    commitSelection(index);
  };

  const handleOptionClick = (index: number) => {
    if (shouldSkipOptionClickRef.current) {
      shouldSkipOptionClickRef.current = false;
      return;
    }

    commitSelection(index);
  };

  const moveActive = (direction: 1 | -1) => {
    if (firstEnabledIndex === -1) {
      return;
    }

    const baseIndex =
      activeIndex >= 0
        ? activeIndex
        : selectedIndex >= 0
          ? selectedIndex
          : direction === 1
            ? lastEnabledIndex
            : firstEnabledIndex;
    const nextIndex = getEnabledOptionIndex(sortedOptions, baseIndex, direction);

    if (nextIndex >= 0) {
      setActiveIndex(nextIndex);
    }
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      openDropdown(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      openDropdown(selectedIndex >= 0 ? selectedIndex : lastEnabledIndex);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) {
        closeDropdown();
      } else {
        openDropdown();
      }
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      openDropdown(firstEnabledIndex);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      openDropdown(lastEnabledIndex);
    }
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(firstEnabledIndex);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(lastEnabledIndex);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeDropdown();
      focusTrigger();
      return;
    }

    if (event.key === 'Tab') {
      closeDropdown();
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commitSelection(index);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`task-field-shell task-dropdown-shell ${isOpen ? 'is-open' : ''} ${isDisabled ? 'is-disabled' : ''}`}
    >
      <span className={`task-field-icon ${isOpen ? 'is-awake' : ''}`} aria-hidden>
        {icon}
      </span>

      <div className="task-dropdown">
        <button
          ref={triggerRef}
          type="button"
          disabled={isDisabled}
          className={`task-field-trigger ${variant === 'score' ? 'task-field-trigger-score' : ''}`}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-controls={`${dropdownId}-listbox`}
          aria-expanded={isOpen}
          onClick={() => {
            if (isOpen) {
              closeDropdown();
            } else {
              openDropdown();
            }
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="task-field-trigger-copy">
            <span className={`task-field-value ${variant === 'score' ? 'task-field-value-score' : ''}`}>
              {selectedOption?.label ?? placeholder}
            </span>
            <span className="task-field-subvalue">
              {selectedOption?.hint ?? (isDisabled ? emptyLabel : 'Pulsa para desplegar')}
            </span>
          </span>

          <span className="task-field-trigger-side">
            {selectedChip}
            <span className={`task-field-caret ${isOpen ? 'is-open' : ''}`} aria-hidden>
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5">
                <path
                  fill="currentColor"
                  d="m5.5 7.5 4.5 5 4.5-5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </span>
        </button>

        {isOpen && (
          <div className="task-dropdown-panel">
            <div className="task-dropdown-panel-glow" aria-hidden />
            <div className="task-dropdown-panel-shell">
              <div
                id={`${dropdownId}-listbox`}
                role="listbox"
                aria-label={ariaLabel}
                className="task-dropdown-list"
              >
                {sortedOptions.map((option, index) => {
                  const isSelected = option.value === value;
                  const isActive = activeIndex === index;

                  return (
                    <button
                      key={`${option.value}-${index}`}
                      ref={(node) => {
                        optionRefs.current[index] = node;
                      }}
                      type="button"
                      role="option"
                      disabled={option.disabled}
                      aria-selected={isSelected}
                      className={`task-dropdown-option ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''}`}
                      style={{ animationDelay: `${index * 28}ms` }}
                      onTouchEnd={(event) => handleOptionTouchEnd(event, index)}
                      onClick={() => handleOptionClick(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onFocus={() => setActiveIndex(index)}
                      onKeyDown={(event) => handleOptionKeyDown(event, index)}
                    >
                      <span className="task-dropdown-option-copy">
                        <span className="task-dropdown-option-label">{option.label}</span>
                        {option.hint && (
                          <span className="task-dropdown-option-hint">{option.hint}</span>
                        )}
                      </span>

                      {option.chip && <span className="task-dropdown-option-chip">{option.chip}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PhotoshopColorPickerProps {
  onChange: (hex: string) => void;
  value: string;
}

function PhotoshopColorPicker({ onChange, value }: PhotoshopColorPickerProps) {
  const squareRef = useRef<HTMLDivElement | null>(null);

  const hsv = useMemo(() => {
    const rgb = hexToRgb(value) ?? hexToRgb(DEFAULT_PROFILE_COLOR);
    if (!rgb) {
      return { h: 24, s: 0.41, v: 0.55 };
    }
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  }, [value]);
  const [hexInput, setHexInput] = useState(value.toUpperCase());

  useEffect(() => {
    setHexInput(value.toUpperCase());
  }, [value]);

  const syncSvFromPointer = useCallback(
    (clientX: number, clientY: number, target: HTMLDivElement) => {
      const bounds = target.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }

      const saturation = clamp((clientX - bounds.left) / bounds.width, 0, 1);
      const brightness = 1 - clamp((clientY - bounds.top) / bounds.height, 0, 1);
      onChange(hsvToHex(hsv.h, saturation, brightness));
    },
    [hsv.h, onChange],
  );

  return (
    <div className="space-y-3 rounded-xl border border-black/10 bg-white/75 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/60">
          Color Picker
        </span>
        <span
          className="inline-flex h-7 w-10 rounded-md border border-black/15 shadow-inner"
          style={{ backgroundColor: value }}
          aria-hidden
        />
      </div>

      <div
        ref={squareRef}
        role="slider"
        aria-label="Saturación y brillo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        className="relative h-36 w-full cursor-crosshair overflow-hidden rounded-lg border border-black/20"
        style={{
          backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${Math.round(hsv.h)} 100% 50%))`,
        }}
        onPointerDown={(event) => {
          if (!squareRef.current) {
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          syncSvFromPointer(event.clientX, event.clientY, squareRef.current);
        }}
        onPointerMove={(event) => {
          if (!squareRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          syncSvFromPointer(event.clientX, event.clientY, squareRef.current);
        }}
      >
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
          }}
          aria-hidden
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink/60">
          Matiz
        </label>
        <input
          type="range"
          min={0}
          max={360}
          value={Math.round(hsv.h)}
          onChange={(event) => {
            const nextHue = clamp(Number(event.target.value), 0, 360);
            onChange(hsvToHex(nextHue, hsv.s, hsv.v));
          }}
          className="h-3 w-full cursor-pointer appearance-none rounded-full border border-black/15"
          style={{
            background:
              'linear-gradient(90deg, #ff0000 0%, #ffff00 16.6%, #00ff00 33.3%, #00ffff 50%, #0000ff 66.6%, #ff00ff 83.3%, #ff0000 100%)',
          }}
        />
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink/60">Hex</span>
        <input
          type="text"
          value={hexInput}
          maxLength={7}
          className="w-full rounded-lg border border-black/12 bg-white px-3 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-ink outline-none transition focus:border-black/30"
          onChange={(event) => {
            const nextValue = event.target.value.toUpperCase();
            setHexInput(nextValue);
            const normalized = normalizeHexColor(nextValue);
            if (normalized) {
              onChange(normalized);
            }
          }}
          onBlur={() => {
            const normalized = normalizeHexColor(hexInput);
            setHexInput((normalized ?? value).toUpperCase());
          }}
        />
      </label>
    </div>
  );
}

function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState<ActivityRange>('week');
  const [barHoverMetric, setBarHoverMetric] = useState<'points' | 'tasks'>('points');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getInitialThemeMode());
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false,
  );
  const themeToggleRef = useRef<HTMLButtonElement | null>(null);
  const themeTransitionTimeoutRef = useRef<number | null>(null);
  const hasAppliedInitialThemeRef = useRef(false);
  const themeTransitionOriginRef = useRef<ThemeTransitionOrigin | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(() => getInviteTokenFromUrl());
  const [isAcceptingInvite, setIsAcceptingInvite] = useState(false);
  const [inviteLinkValue, setInviteLinkValue] = useState<string | null>(null);
  const [inviteLinkExpiresAt, setInviteLinkExpiresAt] = useState<string | null>(null);
  const [isGeneratingInviteLink, setIsGeneratingInviteLink] = useState(false);
  const [isInviteLinkExpanded, setIsInviteLinkExpanded] = useState(false);
  const isInviteJoinPending = Boolean(session && inviteToken);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAuthReady(true);
      return;
    }

    const supabase = getSupabaseClient();
    let isMounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) {
        return;
      }

      if (error) {
        setLoginError(error.message);
      }

      setSession(data.session ?? null);
      setIsAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      if (nextSession) {
        setLoginError(null);
        setLoginSuccess(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobileViewport(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  const resolvedTheme = useMemo<'light' | 'dark'>(
    () => (themeMode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : themeMode),
    [themeMode, systemPrefersDark],
  );

  const applyResolvedTheme = useCallback(
    (nextTheme: 'light' | 'dark', animate: boolean, origin?: ThemeTransitionOrigin) => {
      if (typeof document === 'undefined') {
        return;
      }

      const root = document.documentElement;

      const clearPendingTimeout = () => {
        if (themeTransitionTimeoutRef.current === null || typeof window === 'undefined') {
          return;
        }

        window.clearTimeout(themeTransitionTimeoutRef.current);
        themeTransitionTimeoutRef.current = null;
      };

      const applyImmediately = () => {
        clearPendingTimeout();
        root.classList.remove('theme-transitioning');
        root.classList.toggle('dark', nextTheme === 'dark');
      };

      if (
        !animate ||
        typeof window === 'undefined' ||
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      ) {
        applyImmediately();
        return;
      }

      const fallbackX = Math.round(window.innerWidth * 0.5);
      const fallbackY = Math.round(window.innerHeight * 0.24);
      const originX = origin ? Math.round(origin.x) : fallbackX;
      const originY = origin ? Math.round(origin.y) : fallbackY;

      root.style.setProperty('--theme-transition-ms', `${THEME_TRANSITION_MS}ms`);
      root.style.setProperty('--theme-origin-x', `${originX}px`);
      root.style.setProperty('--theme-origin-y', `${originY}px`);
      root.classList.add('theme-transitioning');

      clearPendingTimeout();
      window.requestAnimationFrame(() => {
        root.classList.toggle('dark', nextTheme === 'dark');
      });

      themeTransitionTimeoutRef.current = window.setTimeout(() => {
        root.classList.remove('theme-transitioning');
        themeTransitionTimeoutRef.current = null;
      }, THEME_TRANSITION_MS);
    },
    [],
  );

  const handleThemeSwitch = () => {
    if (themeToggleRef.current) {
      const bounds = themeToggleRef.current.getBoundingClientRect();
      themeTransitionOriginRef.current = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
    } else {
      themeTransitionOriginRef.current = null;
    }

    setThemeMode((previous) => {
      if (previous === 'system') {
        return systemPrefersDark ? 'light' : 'dark';
      }

      return previous === 'dark' ? 'light' : 'dark';
    });
  };

  useEffect(() => {
    const shouldAnimate = hasAppliedInitialThemeRef.current;
    const nextOrigin = themeTransitionOriginRef.current ?? undefined;
    applyResolvedTheme(resolvedTheme, shouldAnimate, nextOrigin);
    themeTransitionOriginRef.current = null;
    hasAppliedInitialThemeRef.current = true;
  }, [applyResolvedTheme, resolvedTheme]);

  useEffect(() => {
    return () => {
      if (themeTransitionTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(themeTransitionTimeoutRef.current);
        themeTransitionTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // Ignora fallos de persistencia (modo privado/cuota).
    }
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return;
      }

      if (event.newValue === null) {
        setThemeMode('system');
        return;
      }

      if (isThemeMode(event.newValue)) {
        setThemeMode(event.newValue);
        return;
      }

      setThemeMode('system');
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (
      themeMode !== 'system' ||
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => setSystemPrefersDark(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [themeMode]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['community-dashboard', session?.user.id, selectedCommunityId, activityRange],
    queryFn: () => fetchCommunityDashboard(selectedCommunityId, activityRange),
    enabled:
      isSupabaseConfigured &&
      isAuthReady &&
      Boolean(session) &&
      !isInviteJoinPending &&
      !isAcceptingInvite,
  });

  const activeCommunityId = data?.communityId ?? null;
  const { data: tasksData = EMPTY_TASKS } = useQuery({
    queryKey: ['community-tasks', activeCommunityId],
    queryFn: () => fetchCommunityTasks(activeCommunityId ?? ''),
    enabled: isSupabaseConfigured && isAuthReady && Boolean(session) && Boolean(activeCommunityId),
  });
  const { data: categoriesData = EMPTY_CATEGORIES } = useQuery({
    queryKey: ['task-categories', activeCommunityId],
    queryFn: () => fetchTaskCategories(activeCommunityId ?? ''),
    enabled: isSupabaseConfigured && isAuthReady && Boolean(session) && Boolean(activeCommunityId),
  });
  const { data: myRecentTaskLogs = [] } = useQuery({
    queryKey: ['my-recent-task-logs', activeCommunityId, session?.user.id],
    queryFn: () => fetchMyRecentTaskLogs(activeCommunityId ?? '', 5),
    enabled: isSupabaseConfigured && isAuthReady && Boolean(session) && Boolean(activeCommunityId),
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !isAuthReady || !session || !activeCommunityId) {
      return;
    }

    const supabase = getSupabaseClient();
    let isDisposed = false;
    let invalidateTimer: number | undefined;

    const scheduleRefresh = () => {
      if (isDisposed) {
        return;
      }

      window.clearTimeout(invalidateTimer);
      invalidateTimer = window.setTimeout(() => {
        if (isDisposed) {
          return;
        }

        void Promise.all([
          queryClient.invalidateQueries({ queryKey: ['community-dashboard'] }),
          queryClient.invalidateQueries({
            queryKey: ['my-recent-task-logs'],
          }),
        ]);
      }, 150);
    };

    const channel = supabase
      .channel(`community-task-logs:${activeCommunityId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_logs',
          filter: `community_id=eq.${activeCommunityId}`,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      isDisposed = true;
      window.clearTimeout(invalidateTimer);
      void supabase.removeChannel(channel);
    };
  }, [activeCommunityId, isAuthReady, queryClient, session]);

  useEffect(() => {
    setInviteLinkValue(null);
    setInviteLinkExpiresAt(null);
    setIsInviteLinkExpanded(false);
  }, [activeCommunityId]);

  const [taskDate, setTaskDate] = useState(() => getTodayIsoDate());
  const [taskDescription, setTaskDescription] = useState('');
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isDeletingTaskEntryId, setIsDeletingTaskEntryId] = useState<string | null>(null);
  const [communityTasks, setCommunityTasks] = useState<CommunityTask[]>([]);
  const [taskFilterCategory, setTaskFilterCategory] = useState('');
  const [communityTaskName, setCommunityTaskName] = useState('');
  const [taskCategories, setTaskCategories] = useState<string[]>([]);
  const [communityTaskCategory, setCommunityTaskCategory] = useState('');
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [communityTaskScore, setCommunityTaskScore] = useState(4);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [isMobileTasksOpen, setIsMobileTasksOpen] = useState(true);
  const [isMobileCreateTaskOpen, setIsMobileCreateTaskOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<CommunityTask | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isCommunitiesMenuOpen, setIsCommunitiesMenuOpen] = useState(false);
  const [todayStatusCardMemberUserId, setTodayStatusCardMemberUserId] = useState<string | null>(null);
  const [sevenDayStatusCardMemberUserId, setSevenDayStatusCardMemberUserId] = useState<string | null>(null);
  const [profileAliasDraft, setProfileAliasDraft] = useState('');
  const [profileIconDraft, setProfileIconDraft] = useState<ProfileAvatarIconKey>('leaf_svg');
  const [profileColorDraft, setProfileColorDraft] = useState(DEFAULT_PROFILE_COLOR);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [newCommunityName, setNewCommunityName] = useState('');
  const [isCreateCommunityOpen, setIsCreateCommunityOpen] = useState(false);
  const [isCreateCommunityConfirmOpen, setIsCreateCommunityConfirmOpen] = useState(false);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [communityToDelete, setCommunityToDelete] = useState<UserCommunitySummary | null>(null);
  const [communityDeleteConfirmName, setCommunityDeleteConfirmName] = useState('');
  const [isDeletingCommunity, setIsDeletingCommunity] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const communitiesMenuRef = useRef<HTMLDivElement | null>(null);
  const inviteLinkPanelRef = useRef<HTMLDivElement | null>(null);

  const selectedDayLabel = useMemo(() => toDayWithMonthNumberLabel(taskDate), [taskDate]);
  const todayIsoDate = useMemo(() => getTodayIsoDate(), []);

  const weeklyActivities = useMemo<WeeklyActivity[]>(() => {
    if (!data) {
      return [];
    }

    return data.weeklyActivities.map((day) => {
      const normalized: WeeklyActivity = { ...day };

      for (const member of data.members) {
        const tasks = Number(normalized[member.name] ?? 0);
        normalized[member.name] = tasks;

        const pointsKey = getPointsKey(member.name);
        const pointsRaw = normalized[pointsKey];
        const points = pointsRaw == null ? tasks : Number(pointsRaw);
        normalized[pointsKey] = Number.isFinite(points) ? points : tasks;
      }

      return normalized;
    });
  }, [data]);

  const totalsByMember = useMemo(() => {
    if (!data) {
      return [];
    }

    const metricsByUserId = new Map(
      data.memberPeriodMetrics.map((memberMetrics) => [memberMetrics.userId, memberMetrics]),
    );

    return data.members.map((member) => {
      const memberMetrics = metricsByUserId.get(member.userId);
      const completed = Number(memberMetrics?.tasks ?? 0);
      const points = Number(memberMetrics?.points ?? 0);
      return {
        ...member,
        completed,
        points,
      };
    });
  }, [data]);

  const dailyOverview = useMemo<DailyOverviewRow[]>(() => {
    if (!data) {
      return [];
    }

    return weeklyActivities.map((day) => {
      const total = data.members.reduce((acc, member) => acc + Number(day[member.name] ?? 0), 0);
      const totalPoints = data.members.reduce(
        (acc, member) => acc + Number(day[getPointsKey(member.name)] ?? 0),
        0,
      );
      return {
        ...day,
        total,
        totalPoints,
        mobileDayLabel: toMobileDayLabel(day.metricDate),
      };
    });
  }, [data, weeklyActivities]);

  const renderDailyMetricsTooltip = useCallback(
    ({ active, label, payload }: DailyChartTooltipProps) => {
      if (!active || !payload?.length || !data) {
        return null;
      }

      const row = payload[0]?.payload;
      if (!row) {
        return null;
      }

      const isTasksMetric = barHoverMetric === 'tasks';
      const totalValue = isTasksMetric ? row.total : row.totalPoints;
      const totalLabel = isTasksMetric ? `${totalValue} tareas` : `${totalValue} pts`;
      const dateLabel = String(label ?? row.day);

      if (isMobileViewport) {
        return (
          <div className="min-w-[118px] rounded-xl border border-black/15 bg-white/88 px-2.5 py-2 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.9)] backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/62">{dateLabel}</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-ink/55">
              {isTasksMetric ? 'Total tareas' : 'Total puntos'}
            </p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink/85">{totalLabel}</p>
          </div>
        );
      }

      return (
        <div className="min-w-[178px] rounded-2xl border border-black/15 bg-white/92 px-3.5 py-3 shadow-[0_16px_36px_-22px_rgba(15,23,42,0.66)] backdrop-blur-sm">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/58">
            {dateLabel}
          </p>

          <div className="space-y-1.5">
            {data.members.map((member) => {
              const tasks = Number(row[member.name] ?? 0);
              const points = Number(row[getPointsKey(member.name)] ?? 0);
              const metricValue = isTasksMetric ? `${tasks} tareas` : `${points} pts`;

              return (
                <div key={member.userId} className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="flex items-center gap-2 font-medium text-ink/82">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: member.color }}
                      aria-hidden
                    />
                    {member.name}
                  </span>
                  <span className="font-semibold text-ink/78">{metricValue}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-2.5 border-t border-black/12 pt-2 text-[13px] font-semibold text-ink/82">
            Total diario: {totalLabel}
          </div>
        </div>
      );
    },
    [barHoverMetric, data, isMobileViewport],
  );

  const renderDailyChartLegend = useCallback(({ payload }: ChartLegendProps) => {
    if (!payload?.length) {
      return null;
    }

    return (
      <div className="pt-2.5">
        <div className="flex flex-wrap items-start justify-center gap-x-4 gap-y-2.5">
          {payload.map((entry) => (
            <div key={`${entry.value ?? 'legend'}-${entry.color ?? 'color'}`} className="min-w-[58px] text-center">
              <span
                className="mx-auto block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color ?? '#7a5b48' }}
                aria-hidden
              />
              <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-ink/58">
                {entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }, []);

  const weeklyTotal = data?.totalTasks ?? 0;
  const weeklyPointsTotal = data?.totalPoints ?? 0;

  const renderTasksDistributionTooltip = useCallback(
    ({ active, payload }: DonutChartTooltipProps) => {
      if (!active || !payload?.length) {
        return null;
      }

      const entry = payload[0]?.payload;
      if (!entry) {
        return null;
      }

      const hasRealData = weeklyTotal > 0;
      const share = hasRealData ? Math.round((entry.value / weeklyTotal) * 100) : 0;

      if (isMobileViewport) {
        return (
          <div className="rounded-lg border border-black/15 bg-white/88 px-2.5 py-2 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.8)] backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink/62">{entry.name}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-ink/85">
              {hasRealData ? `${entry.value} · ${share}%` : '0 · 0%'}
            </p>
          </div>
        );
      }

      return (
        <div className="min-w-[164px] rounded-2xl border border-black/15 bg-white/92 px-3 py-2.5 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.66)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] font-medium text-ink/82">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.name}
            </span>
            <span className="text-[14px] font-semibold tabular-nums text-ink/85">
              {hasRealData ? `${entry.value}` : '0'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] uppercase tracking-[0.11em] text-ink/58">
            {hasRealData ? `${share}% del total` : 'Sin actividad en el periodo'}
          </p>
        </div>
      );
    },
    [isMobileViewport, weeklyTotal],
  );

  const renderPointsDistributionTooltip = useCallback(
    ({ active, payload }: DonutChartTooltipProps) => {
      if (!active || !payload?.length) {
        return null;
      }

      const entry = payload[0]?.payload;
      if (!entry) {
        return null;
      }

      const hasRealData = weeklyPointsTotal > 0;
      const share = hasRealData ? Math.round((entry.value / weeklyPointsTotal) * 100) : 0;

      if (isMobileViewport) {
        return (
          <div className="rounded-lg border border-black/15 bg-white/88 px-2.5 py-2 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.8)] backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-ink/62">{entry.name}</p>
            <p className="mt-0.5 text-[12px] font-semibold text-ink/85">
              {hasRealData ? `${entry.value} pts · ${share}%` : '0 pts · 0%'}
            </p>
          </div>
        );
      }

      return (
        <div className="min-w-[164px] rounded-2xl border border-black/15 bg-white/92 px-3 py-2.5 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.66)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[13px] font-medium text-ink/82">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.name}
            </span>
            <span className="text-[14px] font-semibold tabular-nums text-ink/85">
              {hasRealData ? `${entry.value} pts` : '0 pts'}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] uppercase tracking-[0.11em] text-ink/58">
            {hasRealData ? `${share}% del total` : 'Sin puntos en el periodo'}
          </p>
        </div>
      );
    },
    [isMobileViewport, weeklyPointsTotal],
  );

  const topMember = useMemo(() => {
    if (!totalsByMember.length) {
      return null;
    }

    return totalsByMember.reduce((best, member) =>
      member.completed > best.completed ? member : best,
    );
  }, [totalsByMember]);

  const topPointsMember = useMemo(() => {
    if (!totalsByMember.length) {
      return null;
    }

    return totalsByMember.reduce((best, member) =>
      member.points > best.points ? member : best,
    );
  }, [totalsByMember]);

  const tasksDeltaLabel = useMemo(
    () => formatDeltaLabel(data?.tasksDeltaPercent ?? null),
    [data?.tasksDeltaPercent],
  );
  const pointsDeltaLabel = useMemo(
    () => formatDeltaLabel(data?.pointsDeltaPercent ?? null),
    [data?.pointsDeltaPercent],
  );
  const periodMemberTasksLabel = data?.activityRange === 'month' ? 'este mes' : 'esta semana';

  const busiestDay = useMemo(() => {
    if (!dailyOverview.length) {
      return { day: '-', total: 0, totalPoints: 0 };
    }

    return dailyOverview.reduce((best, day) => (day.total > best.total ? day : best));
  }, [dailyOverview]);

  const currentUserId = data?.currentUserId;
  const profileMember =
    data?.members.find((member) => member.userId === currentUserId) ?? data?.members[0];
  const activeMember: MemberName = profileMember?.name ?? 'Integrante';
  const currentUserRoleKey = profileMember?.roleKey ?? 'member';
  const roleBadge = {
    owner: {
      label: 'Creador',
      className:
        'border-sky-300/70 bg-sky-100/90 text-sky-800',
    },
    admin: {
      label: 'Admin',
      className:
        'border-emerald-300/70 bg-emerald-100/90 text-emerald-800',
    },
    member: {
      label: 'Integrante',
      className:
        'border-violet-300/70 bg-violet-100/90 text-violet-800',
    },
  }[currentUserRoleKey];
  const canInviteToCommunity =
    profileMember?.roleKey === 'owner' || profileMember?.roleKey === 'admin';
  const activeMemberProfile = profileMember;
  const communityMembers = data?.members ?? [];
  const todayStatusCardMember = useMemo(() => {
    if (!communityMembers.length) {
      return null;
    }

    if (todayStatusCardMemberUserId) {
      const selectedMember = communityMembers.find((member) => member.userId === todayStatusCardMemberUserId);
      if (selectedMember) {
        return selectedMember;
      }
    }

    return activeMemberProfile ?? communityMembers[0];
  }, [activeMemberProfile, communityMembers, todayStatusCardMemberUserId]);
  const todayStatusCardMemberName: MemberName = todayStatusCardMember?.name ?? activeMember;
  const todayStatusCardMemberColor = todayStatusCardMember?.color ?? '#8b6a52';
  const todayStatusCardMemberAvatarIcon = todayStatusCardMember?.avatarIconKey;
  const todayStatusCardMemberLabel = todayStatusCardMember?.name ?? activeMember;

  const sevenDayStatusCardMember = useMemo(() => {
    if (!communityMembers.length) {
      return null;
    }

    if (sevenDayStatusCardMemberUserId) {
      const selectedMember = communityMembers.find((member) => member.userId === sevenDayStatusCardMemberUserId);
      if (selectedMember) {
        return selectedMember;
      }
    }

    return activeMemberProfile ?? communityMembers[0];
  }, [activeMemberProfile, communityMembers, sevenDayStatusCardMemberUserId]);
  const sevenDayStatusCardMemberName: MemberName = sevenDayStatusCardMember?.name ?? activeMember;
  const sevenDayStatusCardMemberColor = sevenDayStatusCardMember?.color ?? '#8b6a52';
  const sevenDayStatusCardMemberAvatarIcon = sevenDayStatusCardMember?.avatarIconKey;
  const sevenDayStatusCardMemberLabel = sevenDayStatusCardMember?.name ?? activeMember;

  const handleCycleTodayStatusCardMember = useCallback(() => {
    if (!communityMembers.length) {
      return;
    }

    setTodayStatusCardMemberUserId((previous) => {
      const currentId = previous ?? todayStatusCardMember?.userId ?? communityMembers[0]?.userId;
      const currentIndex = communityMembers.findIndex((member) => member.userId === currentId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextMember = communityMembers[(safeIndex + 1) % communityMembers.length];
      return nextMember?.userId ?? null;
    });
  }, [communityMembers, todayStatusCardMember]);

  const handleCycleSevenDayStatusCardMember = useCallback(() => {
    if (!communityMembers.length) {
      return;
    }

    setSevenDayStatusCardMemberUserId((previous) => {
      const currentId = previous ?? sevenDayStatusCardMember?.userId ?? communityMembers[0]?.userId;
      const currentIndex = communityMembers.findIndex((member) => member.userId === currentId);
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextMember = communityMembers[(safeIndex + 1) % communityMembers.length];
      return nextMember?.userId ?? null;
    });
  }, [communityMembers, sevenDayStatusCardMember]);

  const handleStatusCardKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>, onActivate: () => void) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      onActivate();
    },
    [],
  );

  useEffect(() => {
    if (!profileMember) {
      return;
    }

    setProfileAliasDraft(profileMember.alias ?? profileMember.baseName);
    const nextIcon = profileMember.avatarIconKey;
    setProfileIconDraft(nextIcon && isValidProfileIconKey(nextIcon) ? nextIcon : 'leaf_svg');
    const normalizedColor = normalizeHexColor(profileMember.color) ?? DEFAULT_PROFILE_COLOR;
    setProfileColorDraft(normalizedColor);
    setIsIconPickerOpen(false);
    setIsColorPickerOpen(false);
  }, [profileMember]);

  useEffect(() => {
    if (!communityMembers.length) {
      if (todayStatusCardMemberUserId) {
        setTodayStatusCardMemberUserId(null);
      }
      if (sevenDayStatusCardMemberUserId) {
        setSevenDayStatusCardMemberUserId(null);
      }
      return;
    }

    if (todayStatusCardMemberUserId) {
      const existsTodayMember = communityMembers.some((member) => member.userId === todayStatusCardMemberUserId);
      if (!existsTodayMember) {
        setTodayStatusCardMemberUserId(null);
      }
    }

    if (sevenDayStatusCardMemberUserId) {
      const existsSevenDayMember = communityMembers.some(
        (member) => member.userId === sevenDayStatusCardMemberUserId,
      );
      if (!existsSevenDayMember) {
        setSevenDayStatusCardMemberUserId(null);
      }
    }
  }, [communityMembers, sevenDayStatusCardMemberUserId, todayStatusCardMemberUserId]);

  useEffect(() => {
    if (!selectedCommunityId || !data) {
      return;
    }

    const exists = data.userCommunities.some((community) => community.id === selectedCommunityId);
    if (!exists) {
      setSelectedCommunityId(null);
    }
  }, [data, selectedCommunityId]);

  const todayForTodayStatusCardMember = useMemo(() => {
    if (!dailyOverview.length) {
      return 0;
    }

    const dayRecord = dailyOverview.find((day) => day.metricDate === todayIsoDate);
    return dayRecord ? Number(dayRecord[todayStatusCardMemberName] ?? 0) : 0;
  }, [dailyOverview, todayStatusCardMemberName, todayIsoDate]);
  const todayPointsForTodayStatusCardMember = useMemo(() => {
    if (!dailyOverview.length) {
      return 0;
    }

    const dayRecord = dailyOverview.find((day) => day.metricDate === todayIsoDate);
    return dayRecord ? Number(dayRecord[getPointsKey(todayStatusCardMemberName)] ?? 0) : 0;
  }, [dailyOverview, todayStatusCardMemberName, todayIsoDate]);
  const lastSevenDaysForSevenDayStatusCardMember = useMemo(() => {
    if (!dailyOverview.length) {
      return {
        tasks: 0,
        points: 0,
        rangeLabel: 'Sin datos',
      };
    }

    const lastSevenRows = dailyOverview.slice(-7);
    const tasks = lastSevenRows.reduce((acc, day) => acc + Number(day[sevenDayStatusCardMemberName] ?? 0), 0);
    const points = lastSevenRows.reduce(
      (acc, day) => acc + Number(day[getPointsKey(sevenDayStatusCardMemberName)] ?? 0),
      0,
    );
    const firstRow = lastSevenRows[0];
    const lastRow = lastSevenRows[lastSevenRows.length - 1];
    const rangeLabel =
      firstRow && lastRow ? `${firstRow.mobileDayLabel} - ${lastRow.mobileDayLabel}` : 'Acumulado';

    return {
      tasks,
      points,
      rangeLabel,
    };
  }, [dailyOverview, sevenDayStatusCardMemberName]);

  const isTodaySelected = taskDate === todayIsoDate;
  const taskFilterCategories = useMemo(
    () => Array.from(new Set(communityTasks.map((task) => task.category))),
    [communityTasks],
  );
  const filteredCommunityTasks = useMemo(
    () =>
      taskFilterCategory
        ? communityTasks.filter((task) => task.category === taskFilterCategory)
        : communityTasks,
    [communityTasks, taskFilterCategory],
  );
  const selectedCommunityTask = useMemo(
    () => filteredCommunityTasks.find((task) => task.name === taskDescription) ?? null,
    [filteredCommunityTasks, taskDescription],
  );
  const selectedTaskBadgeClass = selectedCommunityTask
    ? getScoreBadgeClass(selectedCommunityTask.score)
    : 'border-black/12 bg-white/70 text-ink/60';
  const createTaskScoreBadgeClass = getScoreBadgeClass(communityTaskScore);
  const createCategoryOptions = useMemo(
    () =>
      taskCategories.map((category) => ({
        value: category,
        label: category,
        hint: 'Categoría activa',
      })),
    [taskCategories],
  );
  const scoreOptions = useMemo(
    () =>
      [2, 3, 4, 5, 6, 7].map((score) => ({
        value: String(score),
        label: String(score),
        hint:
          score <= 3
            ? 'Ritmo ligero'
            : score <= 5
              ? 'Impacto medio'
              : 'Alta recompensa',
        chip: `${score} pts`,
      })),
    [],
  );
  const filterCategoryOptions = useMemo(
    () => [
      {
        value: '',
        label: 'Todas',
        hint: `${taskFilterCategories.length || 0} categorías disponibles`,
      },
      ...taskFilterCategories.map((category) => ({
        value: category,
        label: category,
        hint: 'Filtro puntual',
      })),
    ],
    [taskFilterCategories],
  );
  const taskDescriptionOptions = useMemo(
    () =>
      filteredCommunityTasks.map((task) => ({
        value: task.name,
        label: task.name,
        hint: task.category,
        chip: `${task.score} pts`,
      })),
    [filteredCommunityTasks],
  );
  const isCommunityDeleteNameMatch =
    communityToDelete !== null && communityDeleteConfirmName.trim() === communityToDelete.name;

  const donutData = useMemo(() => {
    const withTasks = totalsByMember.filter((member) => member.completed > 0);

    if (withTasks.length) {
      return withTasks.map((member) => ({
        name: member.name,
        value: member.completed,
        color: member.color,
      }));
    }

    return totalsByMember.map((member) => ({
      name: member.name,
      value: 1,
      color: member.color,
    }));
  }, [totalsByMember]);

  const donutPointsData = useMemo(() => {
    const withPoints = totalsByMember.filter((member) => member.points > 0);

    if (withPoints.length) {
      return withPoints.map((member) => ({
        name: member.name,
        value: member.points,
        color: member.color,
      }));
    }

    return totalsByMember.map((member) => ({
      name: member.name,
      value: 1,
      color: member.color,
    }));
  }, [totalsByMember]);

  const topTasks = data?.topTasks ?? [];
  const recentCommunityActivities = data?.recentCommunityActivities ?? [];

  useEffect(() => {
    setCommunityTasks(tasksData);
  }, [tasksData]);

  useEffect(() => {
    setTaskCategories(categoriesData);
  }, [categoriesData]);

  useEffect(() => {
    if (taskFilterCategory && !taskFilterCategories.includes(taskFilterCategory)) {
      setTaskFilterCategory('');
    }
  }, [taskFilterCategories, taskFilterCategory]);

  useEffect(() => {
    if (!taskDescription && filteredCommunityTasks.length > 0) {
      setTaskDescription(filteredCommunityTasks[0].name);
      return;
    }

    if (taskDescription && !filteredCommunityTasks.some((task) => task.name === taskDescription)) {
      setTaskDescription(filteredCommunityTasks[0]?.name ?? '');
    }
  }, [filteredCommunityTasks, taskDescription]);

  useEffect(() => {
    if (!communityTaskCategory && taskCategories.length > 0) {
      setCommunityTaskCategory(taskCategories[0]);
      return;
    }

    if (communityTaskCategory && !taskCategories.includes(communityTaskCategory)) {
      setCommunityTaskCategory(taskCategories[0] ?? '');
    }
  }, [taskCategories, communityTaskCategory]);

  useEffect(() => {
    if (!isProfileMenuOpen && !isCommunitiesMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;

      if (isProfileMenuOpen && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setIsProfileMenuOpen(false);
        setIsIconPickerOpen(false);
        setIsColorPickerOpen(false);
        setIsCreateCommunityOpen(false);
        setIsCreateCommunityConfirmOpen(false);
      }

      if (
        isCommunitiesMenuOpen &&
        communitiesMenuRef.current &&
        !communitiesMenuRef.current.contains(target)
      ) {
        setIsCommunitiesMenuOpen(false);
        setIsCreateCommunityOpen(false);
        setIsCreateCommunityConfirmOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (isProfileMenuOpen) {
        setIsProfileMenuOpen(false);
        setIsIconPickerOpen(false);
        setIsColorPickerOpen(false);
        setIsCreateCommunityOpen(false);
        setIsCreateCommunityConfirmOpen(false);
      }

      if (isCommunitiesMenuOpen) {
        setIsCommunitiesMenuOpen(false);
        setIsCreateCommunityOpen(false);
        setIsCreateCommunityConfirmOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isProfileMenuOpen, isCommunitiesMenuOpen]);

  useEffect(() => {
    if (!inviteLinkValue || !isInviteLinkExpanded) {
      return;
    }

    const handlePointerOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (inviteLinkPanelRef.current && !inviteLinkPanelRef.current.contains(target)) {
        setIsInviteLinkExpanded(false);
      }
    };

    window.addEventListener('mousedown', handlePointerOutside);
    window.addEventListener('touchstart', handlePointerOutside);
    return () => {
      window.removeEventListener('mousedown', handlePointerOutside);
      window.removeEventListener('touchstart', handlePointerOutside);
    };
  }, [inviteLinkValue, isInviteLinkExpanded]);

  const showToast = (message: string, variant: ToastVariant = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((previous) => [...previous, { id, message, variant }]);

    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 3000);
  };

  useEffect(() => {
    if (!isAuthReady || !session || !inviteToken) {
      return;
    }

    let isCancelled = false;

    const handleInviteJoin = async () => {
      setIsAcceptingInvite(true);
      try {
        const result = await acceptCommunityInviteByToken(inviteToken);
        if (isCancelled) {
          return;
        }

        if (result.status === 'already_member') {
          showToast('Ya eres parte de esta comunidad.');
        } else if (result.status === 'reactivated') {
          showToast(`Te reincorporaste a "${result.communityName}".`);
        } else {
          showToast(`Te uniste a "${result.communityName}".`);
        }

        setSelectedCommunityId(result.communityId);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['community-dashboard'] }),
          queryClient.invalidateQueries({ queryKey: ['community-tasks'] }),
          queryClient.invalidateQueries({ queryKey: ['task-categories'] }),
          queryClient.invalidateQueries({ queryKey: ['my-recent-task-logs'] }),
        ]);
      } catch (inviteError) {
        if (isCancelled) {
          return;
        }

        const message =
          inviteError instanceof Error
            ? inviteError.message
            : 'No se pudo procesar la invitación a la comunidad.';
        showToast(message, 'error');
      } finally {
        if (isCancelled) {
          return;
        }

        clearInviteTokenFromUrl();
        setInviteToken(null);
        setIsAcceptingInvite(false);
      }
    };

    handleInviteJoin();

    return () => {
      isCancelled = true;
    };
  }, [isAuthReady, inviteToken, queryClient, session]);

  const handleGenerateCommunityInvite = async () => {
    if (!activeCommunityId) {
      showToast('No se encontró una comunidad activa para invitar.', 'error');
      return;
    }

    setIsGeneratingInviteLink(true);
    try {
      const invite = await createCommunityInviteLink(activeCommunityId);
      setInviteLinkValue(invite.inviteLink);
      setInviteLinkExpiresAt(invite.expiresAt);
      setIsInviteLinkExpanded(true);

      try {
        await navigator.clipboard.writeText(invite.inviteLink);
        showToast('Link de invitación generado y copiado.');
      } catch {
        showToast('Link de invitación generado.');
      }
    } catch (inviteError) {
      const message =
        inviteError instanceof Error
          ? inviteError.message
          : 'No se pudo generar el link de invitación.';
      showToast(message, 'error');
    } finally {
      setIsGeneratingInviteLink(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLinkValue) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteLinkValue);
      showToast('Link copiado.');
    } catch {
      showToast('No se pudo copiar el link automáticamente.', 'error');
    }
  };

  const handleGoToCommunity = (communityId: string) => {
    setSelectedCommunityId(communityId);
    setIsCommunitiesMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenDeleteCommunity = (community: UserCommunitySummary) => {
    setCommunityToDelete(community);
    setCommunityDeleteConfirmName('');
  };

  const handleConfirmDeleteCommunity = async () => {
    if (!communityToDelete) {
      return;
    }

    const typedName = communityDeleteConfirmName.trim();
    if (typedName !== communityToDelete.name) {
      showToast('Escribe exactamente el nombre de la comunidad para confirmar.', 'error');
      return;
    }

    setIsDeletingCommunity(true);
    try {
      const deletingCommunity = communityToDelete;
      await deleteCommunity(deletingCommunity.id);

      if (deletingCommunity.id === activeCommunityId) {
        setSelectedCommunityId(null);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['community-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['my-recent-task-logs'] }),
      ]);

      setCommunityToDelete(null);
      setCommunityDeleteConfirmName('');
      setIsCommunitiesMenuOpen(false);
      showToast(`Comunidad eliminada: "${deletingCommunity.name}".`);
    } catch (deleteError) {
      const message =
        deleteError instanceof Error ? deleteError.message : 'No se pudo eliminar la comunidad.';
      showToast(message, 'error');
    } finally {
      setIsDeletingCommunity(false);
    }
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profileMember) {
      showToast('No se encontró un perfil activo.', 'error');
      return;
    }

    const trimmedAlias = profileAliasDraft.trim();
    if (trimmedAlias.length > 0 && trimmedAlias.length < 2) {
      showToast('El alias debe tener al menos 2 caracteres.', 'error');
      return;
    }
    if (trimmedAlias.length > 32) {
      showToast('El alias no puede superar 32 caracteres.', 'error');
      return;
    }

    const normalizedColor = normalizeHexColor(profileColorDraft);
    if (!normalizedColor) {
      showToast('El color debe estar en formato HEX, por ejemplo #8b6a52.', 'error');
      return;
    }

    setIsSavingProfile(true);
    try {
      await updateMyProfileSettings({
        alias: trimmedAlias.length > 0 ? trimmedAlias : null,
        avatarIconKey: profileIconDraft,
        avatarColor: normalizedColor,
      });
      await queryClient.invalidateQueries({ queryKey: ['community-dashboard'] });
      setIsProfileMenuOpen(false);
      setIsIconPickerOpen(false);
      setIsColorPickerOpen(false);
      setIsCreateCommunityOpen(false);
      setIsCreateCommunityConfirmOpen(false);
      showToast('Perfil actualizado.');
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : 'No se pudo actualizar el perfil.';
      showToast(message, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePrepareCreateCommunity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const communityName = newCommunityName.trim();
    if (communityName.length < 3) {
      showToast('El nombre de la comunidad debe tener al menos 3 caracteres.', 'error');
      return;
    }
    if (communityName.length > 64) {
      showToast('El nombre de la comunidad no puede superar 64 caracteres.', 'error');
      return;
    }

    setIsCreateCommunityConfirmOpen(true);
  };

  const handleConfirmCreateCommunity = async () => {
    const communityName = newCommunityName.trim();
    if (!communityName) {
      showToast('Escribe un nombre para la comunidad.', 'error');
      return;
    }

    setIsCreatingCommunity(true);
    try {
      const created = await createCommunity(communityName);
      setSelectedCommunityId(created.id);
      setNewCommunityName('');
      setIsCreateCommunityOpen(false);
      setIsCreateCommunityConfirmOpen(false);
      setIsCommunitiesMenuOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['community-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task-categories'] }),
        queryClient.invalidateQueries({ queryKey: ['my-recent-task-logs'] }),
      ]);
      showToast(`Comunidad creada: "${created.name}".`);
    } catch (creationError) {
      const message =
        creationError instanceof Error ? creationError.message : 'No se pudo crear la comunidad.';
      showToast(message, 'error');
    } finally {
      setIsCreatingCommunity(false);
    }
  };

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      setLoginSuccess(null);
      setLoginError('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
      return;
    }

    const email = loginEmail.trim();
    if (!email || !loginPassword) {
      setLoginSuccess(null);
      setLoginError(
        authMode === 'sign-up'
          ? 'Completa correo y contraseña para crear tu cuenta.'
          : 'Completa correo y contraseña.',
      );
      return;
    }

    if (authMode === 'sign-up' && loginPassword.length < 6) {
      setLoginSuccess(null);
      setLoginError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsLoginSubmitting(true);
    setLoginError(null);
    setLoginSuccess(null);

    try {
      const supabase = getSupabaseClient();

      if (authMode === 'sign-up') {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password: loginPassword,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!signUpData.session) {
          setLoginSuccess(
            'Cuenta creada. Revisa tu correo para confirmar y luego inicia sesión.',
          );
          setAuthMode('sign-in');
          setLoginPassword('');
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: loginPassword,
        });

        if (signInError) {
          throw signInError;
        }
      }
    } catch (authError) {
      const message = getFriendlyAuthErrorMessage(authError, authMode);
      setLoginError(message);
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (!isSupabaseConfigured) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      showToast(`No se pudo cerrar sesión: ${signOutError.message}`, 'error');
      return;
    }

    setFormMessage(null);
    setTaskDescription('');
    setSelectedCommunityId(null);
    setIsCommunitiesMenuOpen(false);
    setIsProfileMenuOpen(false);
    setIsIconPickerOpen(false);
    setIsColorPickerOpen(false);
    setNewCommunityName('');
    setInviteLinkValue(null);
    setInviteLinkExpiresAt(null);
    setIsInviteLinkExpanded(false);
    setIsCreateCommunityOpen(false);
    setIsCreateCommunityConfirmOpen(false);
    setCommunityToDelete(null);
    setCommunityDeleteConfirmName('');
    await queryClient.invalidateQueries({ queryKey: ['community-dashboard'] });
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeCommunityId) {
      setFormMessage('No se encontró una comunidad activa.');
      return;
    }

    if (!selectedCommunityTask) {
      setFormMessage('Escribe una tarea antes de registrar.');
      return;
    }

    const safeCount = 1;
    const dayLabel = toDayLabel(taskDate);

    try {
      await createTaskLog(selectedCommunityTask.id, activeCommunityId, taskDate, safeCount);
      if (filteredCommunityTasks.length > 0) {
        setTaskDescription(filteredCommunityTasks[0].name);
      } else {
        setTaskDescription('');
      }
      setFormMessage(`Registrado: ${safeCount} tarea(s) para el integrante activo en ${dayLabel}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['my-recent-task-logs'] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo registrar la tarea.';
      setFormMessage(message);
    }
  };

  const handleDeleteTaskEntry = async (entry: RecentTaskLog) => {
    const confirmed = window.confirm(
      `¿Eliminar este registro?\n\n${entry.taskName} (${toDayLabel(entry.performedOn)}, ${formatDateLabel(
        entry.performedOn,
      )})`,
    );

    if (!confirmed) {
      return;
    }

    setIsDeletingTaskEntryId(entry.id);
    try {
      await deleteTaskLog(entry.id);
      setFormMessage(`Registro eliminado: ${entry.taskName}.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['my-recent-task-logs'] }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar el registro.';
      setFormMessage(message);
    } finally {
      setIsDeletingTaskEntryId(null);
    }
  };

  const handleCommunityTaskCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activeCommunityId) {
      showToast('No se encontró una comunidad activa.', 'error');
      return;
    }

    const name = communityTaskName.trim();
    const category = communityTaskCategory.trim();
    if (!name) {
      showToast('Escribe el nombre de la tarea.', 'error');
      return;
    }
    if (!category) {
      showToast('Selecciona una categoría para la tarea.', 'error');
      return;
    }

    const safeScore = Math.min(7, Math.max(2, Math.floor(communityTaskScore)));

    try {
      await createCommunityTask({
        communityId: activeCommunityId,
        name,
        categoryName: category,
        score: safeScore,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['community-tasks', activeCommunityId] }),
        queryClient.invalidateQueries({ queryKey: ['task-categories', activeCommunityId] }),
      ]);
      setCommunityTaskName('');
      setCommunityTaskScore(4);
      showToast(`Tarea creada: "${name}" (${category}) con puntuación ${safeScore}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la tarea.';
      showToast(message, 'error');
    }
  };

  const handleCategoryCreate = async () => {
    if (!activeCommunityId) {
      showToast('No se encontró una comunidad activa.', 'error');
      return;
    }

    const categoryName = newCategoryName.trim();
    if (!categoryName) {
      showToast('Escribe un nombre para la categoría.', 'error');
      return;
    }

    const alreadyExists = taskCategories.some(
      (existingCategory) => existingCategory.toLowerCase() === categoryName.toLowerCase(),
    );

    if (alreadyExists) {
      showToast(`La categoría "${categoryName}" ya existe.`, 'error');
      return;
    }

    try {
      await createTaskCategory(activeCommunityId, categoryName);
      await queryClient.invalidateQueries({ queryKey: ['task-categories', activeCommunityId] });
      setCommunityTaskCategory(categoryName);
      setNewCategoryName('');
      setIsCreateCategoryOpen(false);
      showToast(`Categoría creada: "${categoryName}".`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear la categoría.';
      showToast(message, 'error');
    }
  };

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) {
      return;
    }

    try {
      await deactivateCommunityTask(taskToDelete.id);
      if (activeCommunityId) {
        await queryClient.invalidateQueries({ queryKey: ['community-tasks', activeCommunityId] });
      }
      showToast(`Tarea eliminada: "${taskToDelete.name}".`);
      setTaskToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo eliminar la tarea.';
      showToast(message, 'error');
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
        <div className="bg-orb-1" aria-hidden />
        <div className="bg-orb-2" aria-hidden />
        <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6">
          <section className="panel overflow-hidden p-6 sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <article>
                <p className="text-xs uppercase tracking-[0.2em] text-ink/58">Nuestro Hogar</p>
                <h1 className="mt-2 font-heading text-4xl text-ink sm:text-5xl">Activa tu conexión</h1>
                <p className="mt-4 max-w-lg text-sm text-ink/72 sm:text-base">
                  Falta configurar variables de entorno para conectar esta app con Supabase.
                </p>
              </article>
              <article className="rounded-2xl border border-amber-900/15 bg-white/80 p-5">
                <p className="metric-label">Variables requeridas</p>
                <pre className="mt-3 overflow-x-auto rounded-xl bg-amber-950/90 p-3 text-xs text-amber-50">
{`VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable_key>`}
                </pre>
                <p className="mt-3 text-xs text-ink/65">
                  Crea o actualiza `.env`, reinicia `npm run dev` y vuelve a cargar.
                </p>
              </article>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!isAuthReady) {
    return (
      <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
        <div className="bg-orb-1" aria-hidden />
        <div className="bg-orb-2" aria-hidden />
        <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="panel p-8 text-center sm:p-12">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/58">Conectando</p>
            <h1 className="mt-2 font-heading text-4xl text-ink">Validando sesión</h1>
            <p className="mt-3 text-sm text-ink/68">Un momento mientras verificamos tu acceso.</p>
          </section>
        </main>
      </div>
    );
  }

  if (!session) {
    const authPanelTitle = authMode === 'sign-up' ? 'Crear cuenta' : 'Bienvenido';
    const authPanelSubtitle = authMode === 'sign-up' ? 'Crear cuenta' : 'Iniciar sesión';
    const authButtonLabel = authMode === 'sign-up' ? 'Crear cuenta en Supabase' : 'Entrar a mi comunidad';
    const authButtonLoadingLabel = authMode === 'sign-up' ? 'Creando cuenta...' : 'Ingresando...';

    return (
      <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
        <div className="bg-orb-1" aria-hidden />
        <div className="bg-orb-2" aria-hidden />
        <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6">
          <section className="panel relative overflow-hidden p-6 sm:p-10">
            <div className="absolute -right-10 -top-8 h-36 w-36 rounded-full bg-amber-200/45 blur-2xl" aria-hidden />
            <div className="absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-lime-200/40 blur-3xl" aria-hidden />
            <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <article>
                <p className="text-xs uppercase tracking-[0.22em] text-ink/55">Portal Privado</p>
                <h1 className="mt-2 max-w-lg font-heading text-4xl leading-tight text-ink sm:text-5xl">
                  Entra a tu comunidad y registra tus tareas reales
                </h1>
                <p className="mt-4 max-w-xl text-sm text-ink/72 sm:text-base">
                  Inicia sesión o crea una cuenta con Supabase para ver integrantes, tareas de la
                  comunidad y métricas del período.
                </p>
                <div className="mt-6 grid gap-2 text-sm text-ink/70">
                  <p>1. Entra con tu correo o crea una cuenta nueva.</p>
                  <p>2. La app carga tu comunidad activa automáticamente.</p>
                  <p>3. Desde ahí ya puedes registrar tareas y puntos.</p>
                </div>
                {inviteToken && (
                  <p className="mt-4 max-w-lg rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                    Tienes una invitación pendiente. Inicia sesión y te uniremos automáticamente.
                  </p>
                )}
              </article>

              <form
                onSubmit={handleLoginSubmit}
                className="rounded-[1.6rem] border border-amber-900/14 bg-white/86 p-5 shadow-lg backdrop-blur-sm sm:p-6"
              >
                <div className="auth-mode-shell">
                  <p className="auth-mode-caption">Modo de acceso</p>
                  <div className="auth-mode-switch" role="tablist" aria-label="Modo de acceso" data-mode={authMode}>
                    <span className="auth-mode-pill" aria-hidden />
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'sign-in'}
                      aria-pressed={authMode === 'sign-in'}
                      onClick={() => {
                        setAuthMode('sign-in');
                        setLoginError(null);
                        setLoginSuccess(null);
                      }}
                      className={`auth-mode-button ${authMode === 'sign-in' ? 'is-active' : ''}`}
                    >
                      Iniciar sesión
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={authMode === 'sign-up'}
                      aria-pressed={authMode === 'sign-up'}
                      onClick={() => {
                        setAuthMode('sign-up');
                        setLoginError(null);
                        setLoginSuccess(null);
                      }}
                      className={`auth-mode-button ${authMode === 'sign-up' ? 'is-active' : ''}`}
                    >
                      Crear cuenta
                    </button>
                  </div>
                </div>

                <p className="mt-4 text-xs uppercase tracking-[0.16em] text-ink/58">{authPanelSubtitle}</p>
                <h2 className="mt-1 font-heading text-3xl text-ink">{authPanelTitle}</h2>

                <label className="mt-5 block space-y-1.5">
                  <span className="metric-label">Correo</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    placeholder="tu@correo.com"
                    className="w-full rounded-xl border border-black/12 bg-white/92 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-black/30"
                  />
                </label>

                <label className="mt-4 block space-y-1.5">
                  <span className="metric-label">Contraseña</span>
                  <input
                    type="password"
                    autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-black/12 bg-white/92 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-black/30"
                  />
                </label>

                {loginSuccess && (
                  <p className="mt-4 rounded-xl border border-lime-300 bg-lime-50 px-3 py-2 text-sm text-lime-800">
                    {loginSuccess}
                  </p>
                )}

                {loginError && (
                  <p className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {loginError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isLoginSubmitting}
                  className="btn-primary mt-5 inline-flex w-full items-center justify-center disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isLoginSubmitting ? authButtonLoadingLabel : authButtonLabel}
                </button>
              </form>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (session && (isInviteJoinPending || isAcceptingInvite)) {
    return (
      <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
        <div className="bg-orb-1" aria-hidden />
        <div className="bg-orb-2" aria-hidden />
        <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="panel p-8 text-center sm:p-12">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/58">Invitación</p>
            <h1 className="mt-2 font-heading text-4xl text-ink">Conectando a la comunidad</h1>
            <p className="mt-3 text-sm text-ink/68">
              Estamos validando tu invitación y activando tu acceso.
            </p>
          </section>
        </main>
      </div>
    );
  }

  if (isError && !data) {
    const dashboardErrorMessage =
      error instanceof Error ? error.message : 'No fue posible cargar los datos de tu comunidad.';

    return (
      <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
        <div className="bg-orb-1" aria-hidden />
        <div className="bg-orb-2" aria-hidden />
        <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6">
          <section className="panel p-8 sm:p-10">
            <p className="text-xs uppercase tracking-[0.16em] text-ink/58">Sin datos para mostrar</p>
            <h1 className="mt-2 font-heading text-4xl text-ink">No hay comunidad activa</h1>
            <p className="mt-3 text-sm text-ink/70">{dashboardErrorMessage}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['community-dashboard'] })}
                className="btn-primary"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl border border-black/18 bg-white px-4 py-2 text-sm font-semibold text-ink/75 transition hover:border-black/35"
              >
                Cambiar sesión
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const renderCommunityTask = (task: CommunityTask) => (
    <article
      key={task.id}
      className="task-list-item flex items-center justify-between gap-3 rounded-xl border border-black/10 bg-white/85 px-3 py-2"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-ink/85">{task.name}</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-ink/55">{task.category}</p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${
            getScoreBadgeClass(task.score)
          }`}
        >
          {task.score} pts
        </span>
        <button
          type="button"
          onClick={() => setTaskToDelete(task)}
          className="inline-flex h-[21px] w-[21px] items-center justify-center rounded-full border border-red-300 bg-red-50 text-sm font-semibold leading-none text-red-700 transition hover:border-red-400 hover:bg-red-100"
          aria-label={`Eliminar tarea ${task.name}`}
        >
          ×
        </button>
      </div>
    </article>
  );

  return (
    <div className="relative isolate min-h-screen overflow-hidden px-3 py-4 pb-16 sm:px-8 sm:py-8">
      <div className="bg-orb-1" aria-hidden />
      <div className="bg-orb-2" aria-hidden />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-6">
        <header
          id="dashboard-menu"
          className="panel sticky top-3 z-40 animate-rise p-3 sm:p-6 lg:static"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
            <div ref={communitiesMenuRef} className="relative w-full sm:w-auto">
              <button
                id="btn-mis-comunidades"
                type="button"
                onClick={() => {
                  setIsCommunitiesMenuOpen((previous) => {
                    const next = !previous;
                    if (!next) {
                      setIsCreateCommunityOpen(false);
                      setIsCreateCommunityConfirmOpen(false);
                    }
                    return next;
                  });
                  if (isProfileMenuOpen) {
                    setIsProfileMenuOpen(false);
                    setIsIconPickerOpen(false);
                    setIsColorPickerOpen(false);
                    setIsCreateCommunityOpen(false);
                    setIsCreateCommunityConfirmOpen(false);
                  }
                }}
                className="group inline-flex w-full items-center gap-3 rounded-2xl border border-amber-800/20 bg-gradient-to-br from-amber-50/95 to-orange-100/80 px-3.5 py-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-800/35 hover:shadow-md sm:w-auto sm:px-4 sm:py-3"
                aria-expanded={isCommunitiesMenuOpen}
                aria-controls="mis-comunidades-menu"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-700/90 text-white sm:h-9 sm:w-9">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 3a4 4 0 1 1 0 8a4 4 0 0 1 0-8m-7 3a3 3 0 1 1 0 6a3 3 0 0 1 0-6m14 0a3 3 0 1 1 0 6a3 3 0 0 1 0-6m-7 7c3.22 0 5.95 1.57 7.02 3.75A1 1 0 0 1 18.13 18H5.87a1 1 0 0 1-.9-1.25C6.05 14.57 8.78 13 12 13m-7 .5c.84 0 1.63.14 2.34.4a8.3 8.3 0 0 0-2.13 3.1H2.5a1 1 0 0 1-.9-1.43C2.3 14.32 3.58 13.5 5 13.5m14 0c1.42 0 2.7.82 3.4 2.07A1 1 0 0 1 21.5 17h-2.71a8.3 8.3 0 0 0-2.13-3.1c.71-.26 1.5-.4 2.34-.4"
                    />
                  </svg>
                </span>
                <span className="leading-tight">
                  <span className="font-heading text-lg text-amber-950/90 sm:text-xl">
                    Mis Comunidades
                  </span>
                </span>
              </button>

              {isCommunitiesMenuOpen && (
                <div
                  id="mis-comunidades-menu"
                  className="absolute left-1/2 top-[calc(100%+0.55rem)] z-[70] w-[min(95vw,420px)] -translate-x-1/2 rounded-2xl border border-black/12 bg-[color:var(--card)] p-3 shadow-xl backdrop-blur-sm sm:left-0 sm:translate-x-0 sm:p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/58">
                    Comunidades del usuario
                  </p>
                  <div className="mt-2 space-y-2">
                    {(data?.userCommunities ?? []).length === 0 && (
                      <p className="rounded-xl border border-black/10 bg-white/75 px-3 py-2 text-sm text-ink/65">
                        No hay comunidades para mostrar.
                      </p>
                    )}
                    {(data?.userCommunities ?? []).map((community) => {
                      const isCommunityActive = community.id === activeCommunityId;
                      const isOwnerCommunity = community.roleKey === 'owner';

                      return (
                        <div
                          key={community.id}
                          className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition ${
                            isCommunityActive
                              ? 'border-lime-200 bg-lime-50/45'
                              : 'border-black/10 bg-white/80 hover:border-black/20 hover:bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            disabled={isCommunityActive}
                            onClick={() => handleGoToCommunity(community.id)}
                            className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left ${
                              isCommunityActive ? 'cursor-default' : ''
                            }`}
                            aria-label={
                              isCommunityActive
                                ? `Comunidad activa ${community.name}`
                                : `Ir a la comunidad ${community.name}`
                            }
                          >
                            <p className="min-w-0 truncate text-sm font-semibold text-ink/85">
                              {community.name}
                            </p>
                            {isCommunityActive && (
                              <span className="rounded-full border border-lime-300 bg-lime-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-lime-800">
                                activa
                              </span>
                            )}
                          </button>
                          {isOwnerCommunity && (
                            <button
                              type="button"
                              onClick={() => handleOpenDeleteCommunity(community)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-300 bg-red-50 text-sm font-semibold leading-none text-red-700 transition hover:border-red-400 hover:bg-red-100"
                              aria-label={`Eliminar comunidad ${community.name}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <section className="mt-3 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreateCommunityOpen((previous) => {
                          const next = !previous;
                          if (!next) {
                            setIsCreateCommunityConfirmOpen(false);
                          }
                          return next;
                        });
                      }}
                      className="mx-auto flex h-7 min-w-[170px] items-center justify-center rounded-full border border-amber-800/25 bg-amber-50/90 px-3 text-[10px] font-semibold uppercase tracking-[0.09em] text-amber-900 transition hover:border-amber-800/45 hover:bg-amber-100"
                    >
                      Crear comunidad
                    </button>

                    {isCreateCommunityOpen && (
                      <form onSubmit={handlePrepareCreateCommunity} className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={newCommunityName}
                          onChange={(event) => {
                            setNewCommunityName(event.target.value);
                            setIsCreateCommunityConfirmOpen(false);
                          }}
                          maxLength={64}
                          placeholder="Ej: Departamento Centro"
                          className="w-full rounded-xl border border-black/12 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-black/30"
                        />

                        {!isCreateCommunityConfirmOpen && (
                          <button
                            type="submit"
                            className="btn-primary inline-flex w-full items-center justify-center px-3 py-2 text-xs uppercase tracking-[0.08em]"
                          >
                            Continuar
                          </button>
                        )}

                        {isCreateCommunityConfirmOpen && (
                          <div className="rounded-xl border border-amber-700/25 bg-amber-50/90 p-3">
                            <p className="text-xs text-ink/70">
                              ¿Confirmas crear la comunidad <strong>{newCommunityName.trim()}</strong>?
                            </p>
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setIsCreateCommunityConfirmOpen(false)}
                                className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70 transition hover:border-black/30"
                              >
                                Volver
                              </button>
                              <button
                                type="button"
                                onClick={handleConfirmCreateCommunity}
                                disabled={isCreatingCommunity}
                                className="btn-primary px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                {isCreatingCommunity ? 'Creando...' : 'Confirmar creación'}
                              </button>
                            </div>
                          </div>
                        )}
                      </form>
                    )}
                  </section>
                </div>
              )}
            </div>
            <div
              ref={profileMenuRef}
              className="relative flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto"
            >
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-xl border border-black/15 bg-white/75 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ink/70 transition hover:border-black/30 sm:px-3 sm:text-xs sm:tracking-[0.11em]"
              >
                Salir
              </button>
              <button
                id="btn-perfil"
                type="button"
                onClick={() =>
                  setIsProfileMenuOpen((previous) => {
                    if (previous) {
                      setIsIconPickerOpen(false);
                      setIsColorPickerOpen(false);
                      setIsCreateCommunityOpen(false);
                      setIsCreateCommunityConfirmOpen(false);
                    } else {
                      setIsCommunitiesMenuOpen(false);
                      setIsCreateCommunityOpen(false);
                      setIsCreateCommunityConfirmOpen(false);
                    }
                    return !previous;
                  })
                }
                className="transition hover:scale-105"
                aria-label="Perfil"
                aria-expanded={isProfileMenuOpen}
                aria-controls="profile-menu"
              >
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full border border-white/55 bg-white/22 text-[22px] font-semibold text-white shadow-sm sm:h-16 sm:w-16"
                  style={{ backgroundColor: profileMember?.color ?? DEFAULT_PROFILE_COLOR }}
                  aria-hidden
                >
                  {renderProfileIcon(profileMember?.avatarIconKey, 'h-9 w-9 rounded-lg object-cover text-white')}
                </span>
              </button>

              {isProfileMenuOpen && (
                <div
                  id="profile-menu"
                  className="absolute left-1/2 top-[calc(100%+0.55rem)] z-[80] max-h-[85vh] w-[min(96vw,390px)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-black/12 bg-[color:var(--card)] p-3 shadow-xl backdrop-blur-sm sm:left-auto sm:right-0 sm:translate-x-0 sm:p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">Mi Perfil</p>

                  <div className="mt-3 flex items-center justify-center">
                    <button
                      ref={themeToggleRef}
                      type="button"
                      className={`theme-toggle ${resolvedTheme === 'dark' ? 'is-dark' : 'is-light'}`}
                      role="switch"
                      aria-checked={resolvedTheme === 'dark'}
                      aria-label="Cambiar entre modo claro y oscuro"
                      onClick={handleThemeSwitch}
                    >
                      <span className="theme-toggle-track" aria-hidden />
                      <span className="theme-toggle-thumb" aria-hidden>
                        <span className="theme-toggle-icon theme-toggle-icon--sun" aria-hidden>
                          <svg viewBox="0 0 24 24" className="h-4 w-4">
                            <path
                              fill="currentColor"
                              d="M12 4.25a.75.75 0 0 1 .75.75v1.8a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Zm0 12.95a.75.75 0 0 1 .75.75v1.8a.75.75 0 0 1-1.5 0v-1.8a.75.75 0 0 1 .75-.75Zm7.75-5.2a.75.75 0 0 1 .75.75a.75.75 0 0 1-.75.75h-1.8a.75.75 0 0 1 0-1.5h1.8Zm-13.95 0a.75.75 0 0 1 .75.75a.75.75 0 0 1-.75.75H4a.75.75 0 0 1 0-1.5h1.8Zm9.3-5.7a.75.75 0 0 1 1.06 0l1.27 1.27a.75.75 0 0 1-1.06 1.06L15.1 7.36a.75.75 0 0 1 0-1.06Zm-7.53 7.53a.75.75 0 0 1 1.06 0l1.27 1.27a.75.75 0 1 1-1.06 1.06L7.57 14.9a.75.75 0 0 1 0-1.06Zm8.8 1.27a.75.75 0 1 1 1.06 1.06l-1.27 1.27a.75.75 0 1 1-1.06-1.06l1.27-1.27Zm-7.53-7.53a.75.75 0 1 1 1.06 1.06L8.63 9.9a.75.75 0 1 1-1.06-1.06l1.27-1.27ZM12 8.25a3.75 3.75 0 1 1 0 7.5a3.75 3.75 0 0 1 0-7.5Z"
                            />
                          </svg>
                        </span>
                        <span className="theme-toggle-icon theme-toggle-icon--moon" aria-hidden>
                          <svg viewBox="0 0 24 24" className="h-4 w-4">
                            <path
                              fill="currentColor"
                              d="M14.53 2.7a.75.75 0 0 1 .84.92 8.7 8.7 0 1 0 10.95 10.95a.75.75 0 0 1 .92.84A10.2 10.2 0 1 1 14.53 2.7Z"
                            />
                            <path
                              fill="currentColor"
                              d="M18.1 6.35a.75.75 0 0 1 .9-.13l.1.08l.08.1l.31.52l.53.31a.75.75 0 0 1 .13.9l-.08.1l-.1.08l-.52.31l-.31.53a.75.75 0 0 1-.9.13l-.1-.08l-.08-.1l-.31-.53l-.52-.31a.75.75 0 0 1-.13-.9l.08-.1l.1-.08l.52-.31l.31-.52Z"
                            />
                          </svg>
                        </span>
                      </span>
                    </button>
                  </div>

                  <form id="profile-settings-form" onSubmit={handleProfileSave} className="mt-4 space-y-3">
                    <section className="rounded-xl bg-white/70 p-3">
                      <p className="metric-label text-center">Icono del perfil</p>
                      <button
                        type="button"
                        onClick={() => setIsIconPickerOpen((previous) => !previous)}
                        aria-label="Seleccionar icono del perfil"
                        className="mt-2 mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/60 transition hover:scale-[1.02]"
                        style={{ backgroundColor: profileColorDraft }}
                      >
                        {renderProfileIcon(profileIconDraft, 'h-12 w-12 rounded object-cover text-white')}
                      </button>

                      {isIconPickerOpen && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {profileIconOptions.map((icon) => {
                            const isSelected = profileIconDraft === icon.key;
                            return (
                              <button
                                key={icon.key}
                                type="button"
                                onClick={() => setProfileIconDraft(icon.key)}
                                className={`rounded-xl border px-2 py-2 text-center transition ${
                                  isSelected
                                    ? 'border-amber-700/55 bg-amber-100/85 shadow-sm'
                                    : 'border-black/10 bg-white/85 hover:border-black/25'
                                }`}
                              >
                                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-white/80 text-ink">
                                  {renderProfileIcon(icon.key, 'h-7 w-7 rounded-md object-cover text-ink')}
                                </span>
                                <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70">
                                  {icon.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <section className="rounded-xl bg-white/70 p-3">
                      <label className="block space-y-1.5">
                        <span className="metric-label text-center">Username</span>
                        <input
                          type="text"
                          value={profileAliasDraft}
                          onChange={(event) => setProfileAliasDraft(event.target.value)}
                          maxLength={32}
                          placeholder="Escribe tu userName"
                          className="w-full rounded-xl border border-black/12 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-black/30"
                        />
                      </label>
                    </section>

                    <section className="rounded-xl bg-white/70 p-3">
                      <button
                        type="button"
                        onClick={() => setIsColorPickerOpen((previous) => !previous)}
                        className="flex w-full items-center gap-3 rounded-xl border border-black/12 bg-white/85 px-3 py-2 text-left transition hover:border-black/25"
                        aria-expanded={isColorPickerOpen}
                        aria-controls="profile-color-picker"
                        aria-label="Editar color del perfil"
                      >
                        <span
                          className="h-8 w-8 shrink-0 rounded-full border border-black/15 shadow-inner"
                          style={{ backgroundColor: profileColorDraft }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block text-sm font-semibold text-ink/80">mi color</span>
                        </span>
                        <span className="text-sm font-semibold text-ink/55" aria-hidden>
                          {isColorPickerOpen ? '−' : '+'}
                        </span>
                      </button>

                      {isColorPickerOpen && (
                        <div id="profile-color-picker" className="mt-2">
                          <PhotoshopColorPicker value={profileColorDraft} onChange={setProfileColorDraft} />
                        </div>
                      )}
                    </section>

                  </form>

                  <div className="mt-4 flex items-center justify-center">
                    <button
                      type="submit"
                      form="profile-settings-form"
                      disabled={isSavingProfile}
                      className="btn-primary px-3 py-2 text-xs uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSavingProfile ? 'Guardando...' : 'Guardar perfil'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <section id="comunidad" className="panel animate-rise p-4 [animation-delay:90ms] sm:p-8">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-ink/60">Comunidad</p>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.09em] ${roleBadge.className}`}
            >
              {roleBadge.label}
            </span>
          </div>
          <h1 className="font-heading text-3xl leading-tight text-ink sm:text-5xl">
            {data?.communityName ?? 'Cargando comunidad...'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/70 sm:text-base">
            Vista general de tareas del hogar, integrantes activos y progreso semanal.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canInviteToCommunity && (
              <button
                type="button"
                onClick={handleGenerateCommunityInvite}
                disabled={isGeneratingInviteLink}
                className="inline-flex items-center rounded-full border border-amber-800/25 bg-amber-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-amber-900 transition hover:border-amber-800/45 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isGeneratingInviteLink ? 'Generando link...' : 'Invitar a la Comunidad'}
              </button>
            )}
            {inviteLinkValue && (
              <div
                ref={inviteLinkPanelRef}
                className="w-full rounded-xl border border-sky-200/80 bg-transparent p-2.5"
              >
                <button
                  type="button"
                  onClick={() => setIsInviteLinkExpanded((previous) => !previous)}
                  aria-expanded={isInviteLinkExpanded}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-sky-800">
                    Link de invitación
                  </p>
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-300 bg-white text-sky-700 transition ${
                      isInviteLinkExpanded ? 'rotate-180' : ''
                    }`}
                    aria-hidden
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5">
                      <path
                        fill="currentColor"
                        d="m5.5 7.5 4.5 5 4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>

                {isInviteLinkExpanded && (
                  <>
                    <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row">
                      <input
                        type="text"
                        readOnly
                        value={inviteLinkValue}
                        className="w-full rounded-lg border border-sky-300 bg-sky-50/10 px-3 py-1.5 text-xs text-sky-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="rounded-lg border border-sky-300 bg-sky-50/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-sky-800 transition hover:border-sky-500 hover:bg-sky-100/40"
                      >
                        Copiar
                      </button>
                    </div>
                    {inviteLinkExpiresAt && (
                      <p className="mt-1.5 text-[11px] text-sky-800/90">
                        Expira: {formatDateTimeLabel(inviteLinkExpiresAt)}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        <section
          id="tareas-comunidad"
          className="panel relative z-20 animate-rise p-4 [animation-delay:130ms] sm:p-8"
        >
          <div className="mb-5">
            <h2 className="font-heading text-[1.8rem] leading-tight text-ink sm:text-3xl">
              Tareas de la Comunidad
            </h2>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-4">
            <article className="space-y-3 rounded-2xl border border-black/10 bg-white/80 p-3.5 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setIsMobileTasksOpen((previous) => !previous)}
                  className="flex items-center gap-2 text-left lg:cursor-default"
                  aria-expanded={isMobileTasksOpen}
                >
                  <h3 className="font-heading text-2xl text-ink">Tareas</h3>
                  <span className="rounded-full border border-black/15 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70 lg:hidden">
                    {isMobileTasksOpen ? 'Ocultar' : 'Ver'}
                  </span>
                </button>
                <span className="rounded-full bg-stone-800/85 px-3 py-1 text-xs uppercase tracking-[0.13em] text-white">
                  {communityTasks.length} creadas
                </span>
              </div>

              <div className={`${isMobileTasksOpen ? 'block' : 'hidden'} lg:block`}>
                {communityTasks.length === 0 && (
                  <p className="rounded-xl border border-dashed border-black/20 bg-white/70 px-3 py-2 text-sm text-ink/65">
                    Aún no hay tareas creadas.
                  </p>
                )}

                {communityTasks.length > 0 && (
                  <>
                    <div
                      className={`task-list-stack lg:hidden ${
                        communityTasks.length > 5 ? 'task-list-scroll-mobile' : ''
                      }`}
                    >
                      {communityTasks.map(renderCommunityTask)}
                    </div>

                    <div
                      className={`hidden lg:block ${communityTasks.length > 4 ? 'task-list-scroll' : ''}`}
                    >
                      <div className="task-list-stack">{communityTasks.map(renderCommunityTask)}</div>
                    </div>
                  </>
                )}
              </div>
            </article>

            <form
              onSubmit={handleCommunityTaskCreate}
              className="space-y-5 rounded-2xl border border-black/10 bg-white/80 p-4 sm:p-5"
            >
              <button
                type="button"
                onClick={() => setIsMobileCreateTaskOpen((previous) => !previous)}
                className="flex w-full items-center justify-between gap-2 text-left lg:cursor-default"
                aria-expanded={isMobileCreateTaskOpen}
              >
                <div className="flex items-center gap-2">
                  <h3 className="font-heading text-2xl text-ink">Crear tarea</h3>
                  <span className="rounded-full border border-black/15 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/70 lg:hidden">
                    {isMobileCreateTaskOpen ? 'Ocultar' : 'Abrir'}
                  </span>
                </div>
                <span
                  className={`hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] sm:inline-flex ${createTaskScoreBadgeClass}`}
                >
                  {communityTaskScore} pts
                </span>
              </button>

              <div
                className={`${isMobileCreateTaskOpen ? 'space-y-5 pt-1' : 'hidden'} lg:block lg:space-y-5 lg:pt-1`}
              >
                <label className="space-y-2">
                  <span className="metric-label">Nombre de la tarea</span>
                  <div className="task-field-shell">
                    <span className="task-field-icon" aria-hidden>
                      ✎
                    </span>
                    <input
                      type="text"
                      placeholder="Ej: Barrer patio"
                      value={communityTaskName}
                      onChange={(event) => setCommunityTaskName(event.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent py-1 text-sm font-semibold text-ink outline-none ring-0 placeholder:text-ink/40"
                    />
                  </div>
                </label>

                <div className="mt-2.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <span className="metric-label">Categoría</span>
                    <button
                      type="button"
                      onClick={() => setIsCreateCategoryOpen((previous) => !previous)}
                      className="inline-flex h-8 items-center justify-center rounded-full border border-black/12 bg-white/45 px-3 text-[10px] font-medium uppercase tracking-[0.1em] text-ink/58 transition hover:border-black/20 hover:bg-white/70"
                    >
                      Crear categoría
                    </button>
                  </div>

                  <TaskDropdown
                    ariaLabel="Seleccionar categoría para la tarea"
                    icon="⌁"
                    value={communityTaskCategory}
                    onChange={setCommunityTaskCategory}
                    options={createCategoryOptions}
                    placeholder="Crea una categoría"
                    emptyLabel="Primero crea una categoría"
                    disabled={taskCategories.length === 0}
                  />

                  {isCreateCategoryOpen && (
                    <div className="flex flex-col items-stretch gap-2 rounded-xl border border-black/10 bg-white/85 p-2.5 sm:flex-row sm:items-center">
                      <input
                        type="text"
                        placeholder="Ej: Exteriores"
                        value={newCategoryName}
                        onChange={(event) => setNewCategoryName(event.target.value)}
                        className="min-w-0 w-full flex-1 rounded-lg border border-black/12 bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-black/30"
                      />
                      <button
                        type="button"
                        onClick={handleCategoryCreate}
                        className="w-full rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink/75 transition hover:border-black/30 sm:w-auto"
                      >
                        Crear
                      </button>
                    </div>
                  )}
                </div>

                <label className="mt-2 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="metric-label">Puntuación (2 a 7)</span>
                  </div>
                  <TaskDropdown
                    ariaLabel="Seleccionar puntuación de la tarea"
                    icon="★"
                    value={String(communityTaskScore)}
                    onChange={(nextValue) => setCommunityTaskScore(Number(nextValue))}
                    options={scoreOptions}
                    placeholder="Elige puntuación"
                    variant="score"
                  />
                </label>

                <div className="mt-5 flex justify-center pt-1">
                  <button
                    type="submit"
                    className="btn-primary inline-flex w-full items-center justify-center sm:w-auto"
                  >
                    Guardar tarea
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section id="resumen" className="panel animate-rise p-4 [animation-delay:160ms] sm:p-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-[1.8rem] leading-tight text-ink sm:text-3xl">Resumen</h2>
              <p className="text-sm text-ink/65">
                Filtra por periodo y revisa el ritmo diario de tareas y puntos de la comunidad.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
              <div
                role="tablist"
                aria-label="Rango de actividades"
                className="range-switch w-full sm:w-[220px]"
              >
                {activityRangeOptions.map((option) => {
                  const isActive = activityRange === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActivityRange(option.value)}
                      className={`range-switch-option ${isActive ? 'is-active' : ''}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="rounded-full border border-black/15 bg-white/75 px-3 py-1 text-center text-[11px] uppercase tracking-[0.15em] text-ink/70">
                  {data?.activityRangeLabel ?? 'Periodo'}
                </span>
                <span className="rounded-full border border-black/15 bg-white/75 px-3 py-1 text-center text-[11px] uppercase tracking-[0.15em] text-ink/70">
                  {data?.activityMonthLabel ?? 'Mes actual'}
                </span>
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="h-[280px] animate-pulse rounded-2xl border border-black/10 bg-white/60 sm:h-[360px]" />
          )}

          {!isLoading && !isError && data && (
            <article className="rounded-2xl border border-black/10 bg-white/70 p-2.5 sm:p-3.5">
              <div className="mb-3 flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/68">
                  Ritmo diario y contribución
                </p>
                <p className="w-full text-[10px] leading-relaxed text-ink/55 sm:w-auto sm:text-[11px]">
                  Día con mayor actividad: <strong>{busiestDay.day}</strong> ({busiestDay.total} tareas,{' '}
                  {busiestDay.totalPoints} pts)
                </p>
              </div>
              <div className="h-[300px] sm:h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={dailyOverview}
                    barGap={0}
                    barCategoryGap="30%"
                    margin={{ top: 6, right: 6, bottom: 6, left: -8 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="2 7" stroke="rgba(91, 69, 55, 0.14)" />
                    <XAxis
                      dataKey={isMobileViewport ? 'mobileDayLabel' : 'day'}
                      tick={{ fill: 'rgba(91, 69, 55, 0.75)', fontSize: 11, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'rgba(91, 69, 55, 0.62)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={14}
                      mirror
                      tickMargin={2}
                      tickCount={5}
                      allowDecimals={false}
                    />
                    <Tooltip
                      shared={false}
                      cursor={isMobileViewport ? false : { fill: 'rgba(128, 98, 76, 0.09)' }}
                      position={isMobileViewport ? { x: 10, y: 10 } : undefined}
                      wrapperStyle={{ outline: 'none' }}
                      content={renderDailyMetricsTooltip}
                    />
                    {!isMobileViewport && (
                      <Legend
                        content={renderDailyChartLegend}
                        wrapperStyle={{ paddingTop: '2px' }}
                      />
                    )}

                    {data.members.map((member) => (
                      <Bar
                        key={member.name}
                        dataKey={getPointsKey(member.name)}
                        name={member.name}
                        fill={member.color}
                        maxBarSize={20}
                        radius={[5, 5, 0, 0]}
                        shape={(shapeProps: unknown) => {
                          const normalizedShapeProps = (shapeProps ?? {}) as {
                            dataKey?: string;
                            fill?: string;
                            height?: number;
                            payload?: Record<string, unknown>;
                            width?: number;
                            x?: number;
                            y?: number;
                          };
                          const {
                            x = 0,
                            y = 0,
                            width = 0,
                            height = 0,
                            fill = '#7a5b48',
                            payload = {},
                            dataKey = '',
                          } = normalizedShapeProps;

                          if (height <= 0 || width <= 0) {
                            return <g />;
                          }

                          const key = String(dataKey);
                          const taskKey = key.endsWith('__points')
                            ? key.slice(0, -'__points'.length)
                            : key;
                          const points = Number(payload[key] ?? 0);
                          const tasks = Number(payload[taskKey] ?? 0);
                          const ratio = points > 0 ? Math.min(tasks / points, 1) : 0;
                          const innerHeight = Math.max(height * ratio, tasks > 0 ? 3 : 0);
                          const innerWidth = Math.max(width * 0.5, 4);
                          const innerX = x + (width - innerWidth) / 2;
                          const innerY = y + (height - innerHeight);

                          return (
                            <g>
                              <rect
                                x={x}
                                y={y}
                                width={width}
                                height={height}
                                rx={5}
                                ry={5}
                                fill={hexToRgba(fill, 0.34)}
                                onMouseEnter={() => setBarHoverMetric('points')}
                                onClick={() => setBarHoverMetric('points')}
                              />
                              <rect
                                x={innerX}
                                y={innerY}
                                width={innerWidth}
                                height={innerHeight}
                                rx={3}
                                ry={3}
                                fill={hexToRgba(fill, 0.82)}
                                onMouseEnter={() => setBarHoverMetric('tasks')}
                                onMouseLeave={() => setBarHoverMetric('points')}
                                onClick={() => setBarHoverMetric('tasks')}
                              />
                            </g>
                          );
                        }}
                      />
                    ))}

                    <Line
                      type="monotone"
                      dataKey="totalPoints"
                      name="Total diario (pts)"
                      stroke="#6f9ebc"
                      strokeWidth={isMobileViewport ? 1.8 : 2.2}
                      dot={
                        isMobileViewport
                          ? { r: 1.6, strokeWidth: 1, stroke: '#6f9ebc', fill: '#e9f3fa' }
                          : { r: 2.6, strokeWidth: 1.2, stroke: '#6f9ebc', fill: '#e9f3fa' }
                      }
                      activeDot={
                        isMobileViewport
                          ? { r: 3, strokeWidth: 1.2, stroke: '#6f9ebc', fill: '#f6fbff' }
                          : { r: 4, strokeWidth: 1.3, stroke: '#6f9ebc', fill: '#f6fbff' }
                      }
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </article>
          )}

          {isError && (
            <p className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              No fue posible cargar el resumen.
            </p>
          )}
        </section>

        <section id="integrantes" className="panel animate-rise p-4 [animation-delay:180ms] sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-heading text-[1.8rem] leading-tight text-ink sm:text-3xl">Integrantes</h2>
            <span className="rounded-full bg-stone-800/85 px-3 py-1 text-xs uppercase tracking-[0.15em] text-white">
              {data?.members.length ?? 0} miembros
            </span>
          </div>

          {isLoading && (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-2xl border border-black/10 bg-white/60"
                />
              ))}
            </div>
          )}

          {!isLoading && !isError && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {totalsByMember.map((member) => (
                <article
                  key={member.name}
                  className="rounded-[1.35rem] border border-black/12 bg-white/88 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-mellow"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: member.color }}
                    >
                      {renderProfileIcon(member.avatarIconKey, 'h-7 w-7 rounded-md object-cover text-white')}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-xl leading-none text-ink sm:text-[2rem]">
                        {member.name}
                      </h3>
                      <p className="mt-1 text-sm text-ink/68 sm:text-base">
                        {member.completed} tareas {periodMemberTasksLabel}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {isError && (
            <p className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              No fue posible cargar los integrantes.
            </p>
          )}
        </section>

        <section id="registro-diario" className="panel animate-rise p-4 [animation-delay:225ms] sm:p-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-[1.8rem] leading-tight text-ink sm:text-3xl">
                Registro del día
              </h2>
              <p className="text-sm text-ink/65">
                Completa tareas del integrante activo. Por defecto se guarda para hoy, pero puedes
                registrar otro día.
              </p>
            </div>
            <span className="w-full rounded-full border border-black/15 bg-white/75 px-3 py-1 text-center text-xs uppercase tracking-[0.15em] text-ink/70 sm:w-auto">
              {selectedDayLabel}
            </span>
          </div>

          {isLoading && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="h-72 animate-pulse rounded-2xl border border-black/10 bg-white/60" />
              <div className="h-72 animate-pulse rounded-2xl border border-black/10 bg-white/60" />
            </div>
          )}

          {!isLoading && !isError && data && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <form
                onSubmit={handleTaskSubmit}
                className="space-y-4 rounded-2xl border border-black/10 bg-white/80 p-3.5 sm:p-4"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center justify-center">
                    <span
                      className="inline-flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full text-white shadow-sm ring-2 ring-white/80"
                      style={{ backgroundColor: activeMemberProfile?.color ?? '#8b6a52' }}
                      title={activeMemberProfile?.name ?? activeMember}
                    >
                      {renderProfileIcon(
                        activeMemberProfile?.avatarIconKey,
                        'h-8 w-8 rounded-md object-cover text-white',
                      )}
                    </span>
                  </div>

                  <label className="space-y-1.5">
                    <span className="metric-label">Fecha</span>
                    <input
                      type="date"
                      value={taskDate}
                      onChange={(event) => setTaskDate(event.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-black/30"
                    />
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-ink/60">
                        Predeterminado: <strong>{isTodaySelected ? 'Hoy' : formatDateLabel(todayIsoDate)}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setTaskDate(getTodayIsoDate())}
                        className="rounded-md border border-black/15 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/70 transition hover:border-black/30"
                      >
                        Hoy
                      </button>
                    </div>
                  </label>
                </div>

                <label className="space-y-2 sm:max-w-[260px]">
                  <span className="metric-label">Filtrar por categoría</span>
                  <TaskDropdown
                    ariaLabel="Filtrar tareas por categoría"
                    icon="⌁"
                    value={taskFilterCategory}
                    onChange={setTaskFilterCategory}
                    options={filterCategoryOptions}
                    placeholder="Todas"
                    disabled={taskFilterCategories.length === 0}
                  />
                </label>

                <label className="space-y-2">
                  <span className="metric-label">Tarea realizada</span>
                  <TaskDropdown
                    ariaLabel="Seleccionar tarea realizada"
                    icon="✓"
                    value={taskDescription}
                    onChange={setTaskDescription}
                    options={taskDescriptionOptions}
                    placeholder={
                      communityTasks.length === 0
                        ? 'No hay tareas creadas'
                        : 'No hay tareas para esta categoría'
                    }
                    emptyLabel={
                      communityTasks.length === 0
                        ? 'Primero crea una tarea'
                        : 'Prueba con otra categoría'
                    }
                    disabled={filteredCommunityTasks.length === 0}
                    selectedChip={
                      selectedCommunityTask ? (
                        <span
                          className={`task-field-badge rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${selectedTaskBadgeClass}`}
                        >
                          {selectedCommunityTask.score} pts
                        </span>
                      ) : null
                    }
                  />
                </label>

                <div className="flex justify-center">
                  <button
                    type="submit"
                    className="btn-primary inline-flex w-full items-center justify-center sm:w-auto"
                  >
                    Registrar tarea
                  </button>
                </div>

                {formMessage && (
                  <p className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-ink/75">
                    {formMessage}
                  </p>
                )}
              </form>

              <aside className="space-y-4 rounded-2xl border border-black/10 bg-white/80 p-3.5 sm:p-4">
                <article
                  className="today-status-card cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                  style={{
                    borderColor: hexToRgba(todayStatusCardMemberColor, 0.34),
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Ver siguiente integrante en estado de hoy"
                  onClick={handleCycleTodayStatusCardMember}
                  onKeyDown={(event) => handleStatusCardKeyDown(event, handleCycleTodayStatusCardMember)}
                >
                  <div className="today-status-top">
                    <div>
                      <p className="metric-label">Estado de hoy</p>
                      <p className="today-status-date">{formatDateLabel(todayIsoDate)}</p>
                    </div>
                    <span
                      className="today-status-avatar"
                      style={{ backgroundColor: todayStatusCardMemberColor }}
                      title={todayStatusCardMemberLabel}
                    >
                      {renderProfileIcon(
                        todayStatusCardMemberAvatarIcon,
                        'h-5 w-5 rounded-sm object-cover text-white',
                      )}
                    </span>
                  </div>

                  <div className="today-status-main">
                    <p className="today-status-count">{todayForTodayStatusCardMember}</p>
                    <p className="today-status-unit">
                      {todayForTodayStatusCardMember === 1 ? 'tarea' : 'tareas'}
                    </p>
                  </div>

                  <div className="today-status-row">
                    <span className="today-status-member">{todayStatusCardMemberLabel}</span>
                    <span className="today-status-points">
                      {todayPointsForTodayStatusCardMember}{' '}
                      {todayPointsForTodayStatusCardMember === 1 ? 'pto' : 'pts'}
                    </span>
                  </div>
                </article>

                <article
                  className="today-status-card cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
                  style={{
                    borderColor: hexToRgba(sevenDayStatusCardMemberColor, 0.34),
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label="Ver siguiente integrante en últimos 7 días"
                  onClick={handleCycleSevenDayStatusCardMember}
                  onKeyDown={(event) => handleStatusCardKeyDown(event, handleCycleSevenDayStatusCardMember)}
                >
                  <div className="today-status-top">
                    <div>
                      <p className="metric-label">Últimos 7 días</p>
                      <p className="today-status-date">{lastSevenDaysForSevenDayStatusCardMember.rangeLabel}</p>
                    </div>
                    <span
                      className="today-status-avatar"
                      style={{ backgroundColor: sevenDayStatusCardMemberColor }}
                      title={sevenDayStatusCardMemberLabel}
                    >
                      {renderProfileIcon(
                        sevenDayStatusCardMemberAvatarIcon,
                        'h-5 w-5 rounded-sm object-cover text-white',
                      )}
                    </span>
                  </div>

                  <div className="today-status-main">
                    <p className="today-status-count">{lastSevenDaysForSevenDayStatusCardMember.tasks}</p>
                    <p className="today-status-unit">
                      {lastSevenDaysForSevenDayStatusCardMember.tasks === 1 ? 'tarea' : 'tareas'}
                    </p>
                  </div>

                  <div className="today-status-row">
                    <span className="today-status-member">{sevenDayStatusCardMemberLabel}</span>
                    <span className="today-status-points">
                      {lastSevenDaysForSevenDayStatusCardMember.points}{' '}
                      {lastSevenDaysForSevenDayStatusCardMember.points === 1 ? 'pto' : 'pts'}
                    </span>
                  </div>
                </article>

                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="metric-label">Mis últimos registros</p>
                      <p className="mt-1 text-xs text-ink/62">
                        Tus tareas más recientes, ordenadas como una libreta de seguimiento.
                      </p>
                    </div>
                    <span className="rounded-full border border-black/10 bg-white/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/62">
                      {myRecentTaskLogs.length}/5
                    </span>
                  </div>

                  <div className="recent-log-stack mt-3">
                    {myRecentTaskLogs.length === 0 && (
                      <div className="recent-log-empty">
                        <span className="recent-log-empty-icon" aria-hidden>
                          <svg viewBox="0 0 24 24" className="h-4 w-4">
                            <path
                              fill="currentColor"
                              d="M7 3.75A1.75 1.75 0 0 0 5.25 5.5v13A1.75 1.75 0 0 0 7 20.25h10A1.75 1.75 0 0 0 18.75 18.5v-13A1.75 1.75 0 0 0 17 3.75H7Zm1.5 3a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm0 4a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm.75 3.25a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z"
                            />
                          </svg>
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-ink/78">Aún no registras actividades.</p>
                          <p className="mt-1 text-xs text-ink/58">
                            Tu libreta empezará a llenarse cuando guardes la primera tarea.
                          </p>
                        </div>
                      </div>
                    )}

                    {myRecentTaskLogs.map((entry) => (
                      <article
                        key={entry.id}
                        className="recent-log-card"
                        style={getRecentLogStyle(entry.categoryName)}
                      >
                        <span className="recent-log-rail" aria-hidden />
                        <div className="recent-log-shell">
                          <div className="recent-log-top">
                            <div className="recent-log-tags">
                              <span
                                className={`shrink-0 rounded-full border px-2 py-[0.22rem] text-[9px] font-semibold uppercase tracking-[0.12em] ${getScoreBadgeClass(entry.scoreSnapshot)}`}
                              >
                                {entry.pointsTotal} pts
                              </span>
                              <span className="recent-log-tag">{entry.categoryName}</span>
                              <span className="recent-log-stamp">
                                {getRecentLogMomentLabel(entry.performedOn)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteTaskEntry(entry)}
                              disabled={isDeletingTaskEntryId === entry.id}
                              className="recent-log-delete"
                              aria-label={`Eliminar registro ${entry.taskName}`}
                            >
                              {isDeletingTaskEntryId === entry.id ? '...' : '×'}
                            </button>
                          </div>

                          <div className="recent-log-body">
                            <p className="recent-log-title">{entry.taskName}</p>
                            <p className="recent-log-meta">
                              Hecha el {toDayLabel(entry.performedOn)}, {formatDateLabel(entry.performedOn)}
                            </p>
                          </div>

                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {isError && (
            <p className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              No fue posible cargar el formulario de registro.
            </p>
          )}
        </section>

        <section
          id="actividades-semanales"
          className="panel animate-rise p-4 [animation-delay:300ms] sm:p-8"
        >
          <div className="mb-5">
            <h2 className="font-heading text-[1.8rem] leading-tight text-ink sm:text-3xl">
              Actividades y métricas
            </h2>
            <p className="text-sm text-ink/65">
              Compara tareas y puntos por integrante para el periodo seleccionado.
            </p>
          </div>

          {isLoading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-2xl border border-black/10 bg-white/60"
                  />
                ))}
              </div>
              <div className="h-[280px] animate-pulse rounded-2xl border border-black/10 bg-white/60 sm:h-[360px]" />
            </div>
          )}

          {!isLoading && !isError && data && (
            <div className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <article className="dashboard-card">
                    <p className="metric-label">Tareas totales</p>
                    <p className="metric-value">{weeklyTotal}</p>
                    <p className="metric-note">
                      {tasksDeltaLabel} {data.previousRangeLabel}
                    </p>
                  </article>

                  <article className="dashboard-card">
                    <p className="metric-label">Puntos totales</p>
                    <p className="metric-value">{weeklyPointsTotal}</p>
                    <p className="metric-note">
                      {pointsDeltaLabel} {data.previousRangeLabel}
                    </p>
                  </article>

                  <article className="dashboard-card">
                    <p className="metric-label">Líder en tareas</p>
                    <p className="metric-value">{topMember?.name ?? '-'}</p>
                    <p className="metric-note">{topMember?.completed ?? 0} tareas completadas</p>
                  </article>

                  <article className="dashboard-card">
                    <p className="metric-label">Líder en puntos</p>
                    <p className="metric-value">{topPointsMember?.name ?? '-'}</p>
                    <p className="metric-note">{topPointsMember?.points ?? 0} puntos obtenidos</p>
                  </article>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <article className="space-y-4 rounded-2xl border border-black/10 bg-white/75 p-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">
                        Distribución de tareas
                      </p>
                      <p className="text-xs text-ink/60">
                        Participación relativa por integrante en el periodo filtrado.
                      </p>
                    </div>

                    <div className="h-52 sm:h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer={false}>
                          <Pie
                            data={donutData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={2}
                            rootTabIndex={-1}
                          >
                            {donutData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            cursor={false}
                            position={isMobileViewport ? { x: 10, y: 10 } : undefined}
                            wrapperStyle={{ outline: 'none' }}
                            content={renderTasksDistributionTooltip}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-3">
                      {totalsByMember.map((member) => {
                        const share = weeklyTotal > 0 ? (member.completed / weeklyTotal) * 100 : 0;

                        return (
                          <div key={member.name} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs uppercase tracking-[0.12em] text-ink/70">
                              <span>{member.name}</span>
                              <span>
                                {member.completed} tareas ({share.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-black/10">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${share}%`,
                                  backgroundColor: member.color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>

                  <article className="space-y-4 rounded-2xl border border-black/10 bg-white/75 p-4">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">
                        Distribución de puntos
                      </p>
                      <p className="text-xs text-ink/60">
                        Participación relativa por integrante según puntos acumulados.
                      </p>
                    </div>

                    <div className="h-52 sm:h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart accessibilityLayer={false}>
                          <Pie
                            data={donutPointsData}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={52}
                            outerRadius={78}
                            paddingAngle={2}
                            rootTabIndex={-1}
                          >
                            {donutPointsData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            cursor={false}
                            position={isMobileViewport ? { x: 10, y: 10 } : undefined}
                            wrapperStyle={{ outline: 'none' }}
                            content={renderPointsDistributionTooltip}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-3">
                      {totalsByMember.map((member) => {
                        const share = weeklyPointsTotal > 0 ? (member.points / weeklyPointsTotal) * 100 : 0;

                        return (
                          <div key={member.name} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs uppercase tracking-[0.12em] text-ink/70">
                              <span>{member.name}</span>
                              <span>
                                {member.points} pts ({share.toFixed(0)}%)
                              </span>
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-black/10">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${share}%`,
                                  backgroundColor: member.color,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <article className="space-y-4 rounded-2xl border border-black/10 bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">
                        Ranking de tareas
                      </p>
                      <p className="text-xs text-ink/60">
                        Tareas más repetidas en el periodo actual.
                      </p>
                    </div>
                    <span className="rounded-full border border-black/12 bg-white/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/65">
                      Top {topTasks.length}
                    </span>
                  </div>

                  {topTasks.length === 0 && (
                    <p className="rounded-xl border border-dashed border-black/15 bg-white/65 px-3 py-2 text-sm text-ink/65">
                      Aún no hay tareas registradas en este periodo.
                    </p>
                  )}

                  {topTasks.length > 0 && (
                    <div className="space-y-3">
                      {topTasks.map((task, index) => {
                        const maxTasks = topTasks[0]?.tasks ?? 1;
                        const width = maxTasks > 0 ? (task.tasks / maxTasks) * 100 : 0;
                        return (
                          <div key={task.taskId} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-ink/82">
                                {index + 1}. {task.taskName}
                              </p>
                              <span className="shrink-0 text-xs uppercase tracking-[0.1em] text-ink/65">
                                x {task.tasks} · {task.points} pts
                              </span>
                            </div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-ink/55">
                              {task.categoryName}
                            </p>
                            <div className="h-2.5 overflow-hidden rounded-full bg-black/10">
                              <div
                                className="h-full rounded-full bg-[#8a5a3f]/75 transition-all duration-500"
                                style={{ width: `${width}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>

                <article className="space-y-4 rounded-2xl border border-black/10 bg-white/75 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="metric-label">Actividad reciente</p>
                      <p className="mt-1 text-xs text-ink/62">
                        Últimos registros de la comunidad en el periodo.
                      </p>
                    </div>
                    <span className="rounded-full border border-black/10 bg-white/75 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/62">
                      {recentCommunityActivities.length}/6
                    </span>
                  </div>

                  {recentCommunityActivities.length === 0 && (
                    <div className="recent-log-empty">
                      <span className="recent-log-empty-icon" aria-hidden>
                        <svg viewBox="0 0 24 24" className="h-4 w-4">
                          <path
                            fill="currentColor"
                            d="M7 3.75A1.75 1.75 0 0 0 5.25 5.5v13A1.75 1.75 0 0 0 7 20.25h10A1.75 1.75 0 0 0 18.75 18.5v-13A1.75 1.75 0 0 0 17 3.75H7Zm1.5 3a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm0 4a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm.75 3.25a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z"
                          />
                        </svg>
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-ink/78">
                          Sin actividad reciente para mostrar.
                        </p>
                        <p className="mt-1 text-xs text-ink/58">
                          Los últimos registros comunitarios aparecerán aquí automáticamente.
                        </p>
                      </div>
                    </div>
                  )}

                  {recentCommunityActivities.length > 0 && (
                    <div className="recent-log-stack mt-3">
                      {recentCommunityActivities.map((activity) => (
                        <article
                          key={activity.id}
                          className="recent-log-card"
                          style={getRecentLogStyle(activity.categoryName)}
                        >
                          <span className="recent-log-rail" aria-hidden />
                          <div className="recent-log-shell">
                            <div className="recent-log-top">
                              <div className="recent-log-tags">
                                <span
                                  className={`shrink-0 rounded-full border px-2 py-[0.22rem] text-[9px] font-semibold uppercase tracking-[0.12em] ${getScoreBadgeClass(activity.pointsTotal)}`}
                                >
                                  {activity.pointsTotal} pts
                                </span>
                                <span className="recent-log-tag">{activity.categoryName}</span>
                                <span className="recent-log-tag">{activity.memberName}</span>
                              </div>
                              <span className="recent-log-stamp">
                                {getRecentLogMomentLabel(activity.performedOn)}
                              </span>
                            </div>

                            <div className="recent-log-body">
                              <p className="recent-log-title">
                                x {activity.quantity} {activity.taskName}
                              </p>
                              <p className="recent-log-meta">
                                Registro del {toDayLabel(activity.performedOn)}, {formatDateLabel(activity.performedOn)}
                              </p>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <article className="rounded-2xl border border-black/10 bg-white/75 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">
                    Matriz diaria de tareas
                  </p>
                  <p className="text-xs text-ink/60">
                    Detecta rápido días vacíos o sobrecarga por integrante.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] border-separate border-spacing-y-2 text-sm">
                    <thead>
                      <tr>
                        <th className="table-head text-left">Día</th>
                        {data.members.map((member) => (
                          <th key={member.name} className="table-head text-left">
                            {member.name}
                          </th>
                        ))}
                        <th className="table-head text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyOverview.map((day) => (
                        <tr key={day.metricDate} className="rounded-xl">
                          <td className="table-cell font-semibold text-ink/80">{day.day}</td>
                          {data.members.map((member) => {
                            const tasks = Number(day[member.name] ?? 0);
                            const alpha = tasks > 0 ? Math.min(0.2 + tasks * 0.13, 0.82) : 0.08;
                            return (
                              <td key={member.name} className="table-cell">
                                <span
                                  className="inline-flex min-w-12 items-center justify-center rounded-lg px-2 py-1 font-semibold"
                                  style={{
                                    color: tasks > 0 ? '#ffffff' : 'rgba(78, 57, 44, 0.78)',
                                    backgroundColor:
                                      tasks > 0
                                        ? hexToRgba(member.color, alpha)
                                        : 'rgba(117, 89, 70, 0.12)',
                                  }}
                                >
                                  {tasks}
                                </span>
                              </td>
                            );
                          })}
                          <td className="table-cell font-semibold text-ink/80">{day.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>
          )}

          {isError && (
            <p className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              No fue posible cargar el dashboard de actividades semanales.
            </p>
          )}
        </section>
      </main>

      {toasts.length > 0 && (
        <div className="pointer-events-none fixed left-3 right-3 top-3 z-[60] flex flex-col gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-[min(92vw,360px)]">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              className={`rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${
                toast.variant === 'error'
                  ? 'border-red-300 bg-red-50/95 text-red-800'
                  : 'border-emerald-300 bg-emerald-50/95 text-emerald-800'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      {communityToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            onClick={() => {
              if (isDeletingCommunity) {
                return;
              }
              setCommunityToDelete(null);
              setCommunityDeleteConfirmName('');
            }}
            aria-label="Cerrar confirmación de eliminación de comunidad"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-community-title"
            className="relative w-full max-w-md rounded-2xl border border-black/15 bg-[color:var(--card)] p-5 shadow-xl"
          >
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Confirmación</p>
            <h3 id="delete-community-title" className="mt-1 font-heading text-2xl text-ink">
              Eliminar comunidad
            </h3>
            <p className="mt-2 text-sm text-ink/70">
              Esta acción eliminará la comunidad <strong>{communityToDelete.name}</strong> y todos sus
              datos asociados.
            </p>
            <p className="mt-3 text-xs text-ink/70">
              Escribe el nombre exacto para confirmar:
              <strong> {communityToDelete.name}</strong>
            </p>
            <input
              type="text"
              value={communityDeleteConfirmName}
              onChange={(event) => setCommunityDeleteConfirmName(event.target.value)}
              placeholder={communityToDelete.name}
              className="mt-2 w-full rounded-xl border border-black/12 bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-black/30"
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setCommunityToDelete(null);
                  setCommunityDeleteConfirmName('');
                }}
                disabled={isDeletingCommunity}
                className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium text-ink/80 transition hover:border-black/30 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteCommunity}
                disabled={!isCommunityDeleteNameMatch || isDeletingCommunity}
                className="w-full rounded-lg border border-red-300 bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isDeletingCommunity ? 'Eliminando...' : 'Eliminar comunidad'}
              </button>
            </div>
          </div>
        </div>
      )}

      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            onClick={() => setTaskToDelete(null)}
            aria-label="Cerrar confirmación"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-task-title"
            className="relative w-full max-w-md rounded-2xl border border-black/15 bg-[color:var(--card)] p-5 shadow-xl"
          >
            <p className="text-[11px] uppercase tracking-[0.14em] text-ink/60">Confirmación</p>
            <h3 id="delete-task-title" className="mt-1 font-heading text-2xl text-ink">
              Eliminar tarea
            </h3>
            <p className="mt-2 text-sm text-ink/70">
              Se eliminará <strong>{taskToDelete.name}</strong> ({taskToDelete.category},{' '}
              {taskToDelete.score} pts). Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium text-ink/80 transition hover:border-black/30 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTask}
                className="w-full rounded-lg border border-red-300 bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 sm:w-auto"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function toDayLabel(dateValue: string): string {
  const parsed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Lunes';
  }

  const weekday = new Intl.DateTimeFormat('es-CL', { weekday: 'long' })
    .format(parsed)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return weekdayMap[weekday] ?? 'Lunes';
}

function toDayWithMonthNumberLabel(dateValue: string): string {
  const parsed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return 'Lunes 1 de Enero';
  }

  const month = new Intl.DateTimeFormat('es-CL', { month: 'long' }).format(parsed);
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1);
  return `${toDayLabel(dateValue)} ${parsed.getDate()} de ${monthCapitalized}`;
}

function formatDateLabel(dateValue: string): string {
  const parsed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
  }).format(parsed);
}

function formatDateTimeLabel(dateValue: string): string {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function formatDeltaLabel(delta: number | null): string {
  if (delta == null) {
    return 'Nuevo';
  }

  if (delta === 0) {
    return '0%';
  }

  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function getInviteTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite')?.trim();
  return token || null;
}

function clearInviteTokenFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('invite')) {
    return;
  }

  params.delete('invite');
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  window.history.replaceState({}, '', nextUrl);
}

function getRecentLogMomentLabel(dateValue: string): string {
  const todayIsoDate = getTodayIsoDate();
  if (dateValue === todayIsoDate) {
    return 'Hoy';
  }

  const today = new Date(`${todayIsoDate}T12:00:00`);
  const performed = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(today.getTime()) || Number.isNaN(performed.getTime())) {
    return toDayLabel(dateValue);
  }

  const diffInDays = Math.round((today.getTime() - performed.getTime()) / 86400000);
  if (diffInDays === 1) {
    return 'Ayer';
  }

  return toDayLabel(dateValue);
}

function getRecentLogStyle(categoryName: string): CSSProperties {
  const palettes = [
    'color-mix(in oklab, var(--primary) 86%, var(--secondary))',
    'color-mix(in oklab, var(--accent) 78%, var(--secondary))',
    'color-mix(in oklab, var(--secondary) 70%, var(--foreground))',
    'color-mix(in oklab, var(--primary) 66%, var(--accent))',
  ];

  const normalized = categoryName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const accent = palettes[hash % palettes.length];

  return {
    '--recent-log-accent': accent,
  } as CSSProperties;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const normalized = value.length === 3 ? value.split('').map((char) => char + char).join('') : value;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default App;
