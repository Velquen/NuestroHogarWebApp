import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import type { MemberName, UserCommunitySummary, WeeklyActivity } from './types/community';

type DailyOverviewRow = WeeklyActivity & { total: number };

type CommunityTask = ApiCommunityTask;
type RecentTaskLog = ApiRecentTaskLog;
const EMPTY_TASKS: CommunityTask[] = [];
const EMPTY_CATEGORIES: string[] = [];

type ToastVariant = 'success' | 'error';

interface AppToast {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface RecentLogTone {
  accent: string;
  border: string;
  chip: string;
  soft: string;
}

type AuthMode = 'sign-in' | 'sign-up';

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

function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['community-dashboard', session?.user.id, selectedCommunityId],
    queryFn: () => fetchCommunityDashboard(selectedCommunityId),
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
  const [profileAliasDraft, setProfileAliasDraft] = useState('');
  const [profileIconDraft, setProfileIconDraft] = useState<ProfileAvatarIconKey>('leaf_svg');
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
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

  const selectedDayLabel = useMemo(() => toDayLabel(taskDate), [taskDate]);
  const todayLabel = useMemo(() => toDayLabel(getTodayIsoDate()), []);
  const todayIsoDate = useMemo(() => getTodayIsoDate(), []);

  const weeklyActivities = useMemo<WeeklyActivity[]>(() => {
    if (!data) {
      return [];
    }

    return data.weeklyActivities.map((day) => ({ ...day }));
  }, [data]);

  const totalsByMember = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.members.map((member) => {
      const completed = weeklyActivities.reduce((acc, day) => acc + Number(day[member.name] ?? 0), 0);
      return {
        ...member,
        completed,
      };
    });
  }, [data, weeklyActivities]);

  const dailyOverview = useMemo<DailyOverviewRow[]>(() => {
    if (!data) {
      return [];
    }

    return weeklyActivities.map((day) => {
      const total = data.members.reduce((acc, member) => acc + Number(day[member.name] ?? 0), 0);
      return {
        ...day,
        total,
      };
    });
  }, [data, weeklyActivities]);

  const weeklyTotal = useMemo(
    () => dailyOverview.reduce((acc, day) => acc + day.total, 0),
    [dailyOverview],
  );

  const activeDays = useMemo(
    () => dailyOverview.filter((day) => day.total > 0).length,
    [dailyOverview],
  );

  const avgTasksPerActiveDay = activeDays > 0 ? (weeklyTotal / activeDays).toFixed(1) : '0';

  const topMember = useMemo(() => {
    if (!totalsByMember.length) {
      return null;
    }

    return totalsByMember.reduce((best, member) =>
      member.completed > best.completed ? member : best,
    );
  }, [totalsByMember]);

  const loadGap = useMemo(() => {
    if (!totalsByMember.length) {
      return 0;
    }

    const completions = totalsByMember.map((member) => member.completed);
    return Math.max(...completions) - Math.min(...completions);
  }, [totalsByMember]);

  const busiestDay = useMemo(() => {
    if (!dailyOverview.length) {
      return { day: '-', total: 0 };
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

  useEffect(() => {
    if (!profileMember) {
      return;
    }

    setProfileAliasDraft(profileMember.alias ?? profileMember.baseName);
    const nextIcon = profileMember.avatarIconKey;
    setProfileIconDraft(nextIcon && isValidProfileIconKey(nextIcon) ? nextIcon : 'leaf_svg');
    setIsIconPickerOpen(false);
  }, [profileMember]);

  useEffect(() => {
    if (!selectedCommunityId || !data) {
      return;
    }

    const exists = data.userCommunities.some((community) => community.id === selectedCommunityId);
    if (!exists) {
      setSelectedCommunityId(null);
    }
  }, [data, selectedCommunityId]);

  const todayForActiveMember = useMemo(() => {
    if (!dailyOverview.length) {
      return 0;
    }

    const dayRecord = dailyOverview.find((day) => day.day === todayLabel);
    return dayRecord ? Number(dayRecord[activeMember] ?? 0) : 0;
  }, [dailyOverview, activeMember, todayLabel]);

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

    setIsSavingProfile(true);
    try {
      await updateMyProfileSettings({
        alias: trimmedAlias.length > 0 ? trimmedAlias : null,
        avatarIconKey: profileIconDraft,
      });
      await queryClient.invalidateQueries({ queryKey: ['community-dashboard'] });
      setIsProfileMenuOpen(false);
      setIsIconPickerOpen(false);
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
                  className="absolute left-0 top-[calc(100%+0.55rem)] z-[70] w-[min(95vw,420px)] rounded-2xl border border-black/12 bg-[color:var(--card)] p-3 shadow-xl backdrop-blur-sm sm:p-4"
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
                          className="flex items-center gap-2 rounded-xl border border-black/10 bg-white/80 px-2 py-1.5 transition hover:border-black/20 hover:bg-white"
                        >
                          <button
                            type="button"
                            onClick={() => handleGoToCommunity(community.id)}
                            className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left"
                            aria-label={`Ir a la comunidad ${community.name}`}
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
            <div ref={profileMenuRef} className="relative ml-auto flex items-center gap-2">
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
                  style={{ backgroundColor: profileMember?.color ?? '#8b6a52' }}
                  aria-hidden
                >
                  {renderProfileIcon(profileMember?.avatarIconKey, 'h-9 w-9 rounded-lg object-cover text-white')}
                </span>
              </button>

              {isProfileMenuOpen && (
                <div
                  id="profile-menu"
                  className="absolute right-0 top-[calc(100%+0.55rem)] z-[80] max-h-[85vh] w-[min(96vw,390px)] overflow-y-auto rounded-2xl border border-black/12 bg-[color:var(--card)] p-3 shadow-xl backdrop-blur-sm sm:p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/55">Mi Perfil</p>

                  <form id="profile-settings-form" onSubmit={handleProfileSave} className="mt-4 space-y-3">
                    <section className="rounded-xl bg-white/70 p-3">
                      <p className="metric-label text-center">Icono del perfil</p>
                      <button
                        type="button"
                        onClick={() => setIsIconPickerOpen((previous) => !previous)}
                        aria-label="Seleccionar icono del perfil"
                        className="mt-2 mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/60 transition hover:scale-[1.02]"
                        style={{ backgroundColor: profileMember?.color ?? '#8b6a52' }}
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
                        <span className="metric-label text-center">UserName</span>
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
                className="w-full rounded-xl border border-sky-200 bg-sky-50/85 p-3"
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
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        readOnly
                        value={inviteLinkValue}
                        className="w-full rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs text-sky-900 outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleCopyInviteLink}
                        className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-sky-800 transition hover:border-sky-500 hover:bg-sky-100"
                      >
                        Copiar
                      </button>
                    </div>
                    {inviteLinkExpiresAt && (
                      <p className="mt-2 text-[11px] text-sky-800/90">
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
          className="panel animate-rise p-4 [animation-delay:130ms] sm:p-8"
        >
          <div className="mb-5">
            <h2 className="font-heading text-[1.8rem] leading-tight text-ink sm:text-3xl">
              Tareas de la Comunidad
            </h2>
            <p className="text-sm text-ink/65">
              Gestiona el listado de tareas creadas y agrega nuevas tareas con puntuación.
            </p>
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

              <div className={`${isMobileCreateTaskOpen ? 'space-y-5 pt-1' : 'hidden'} lg:block`}>
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

                  <div className="task-field-shell">
                    <span className="task-field-icon" aria-hidden>
                      ⌁
                    </span>
                    <select
                      value={communityTaskCategory}
                      onChange={(event) => setCommunityTaskCategory(event.target.value)}
                      className="task-field-select"
                    >
                      {taskCategories.length === 0 && (
                        <option value="">Crea una categoría</option>
                      )}
                      {taskCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <span className="task-field-caret" aria-hidden>
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
                  </div>

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
                  <div className="task-field-shell">
                    <span className="task-field-icon" aria-hidden>
                      ★
                    </span>
                    <select
                      value={communityTaskScore}
                      onChange={(event) => setCommunityTaskScore(Number(event.target.value))}
                      className="task-field-select"
                    >
                      {[2, 3, 4, 5, 6, 7].map((score) => (
                        <option key={score} value={score}>
                          {score}
                        </option>
                      ))}
                    </select>
                    <span className="task-field-caret" aria-hidden>
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
                  </div>
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
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.initials.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-xl leading-none text-ink sm:text-[2rem]">
                        {member.name}
                      </h3>
                      <p className="mt-1 text-sm text-ink/68 sm:text-base">
                        {member.completed} tareas esta semana
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
              Día seleccionado: {selectedDayLabel}
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
                      className="inline-flex h-[3.75rem] w-[3.75rem] items-center justify-center rounded-full text-base font-semibold text-white shadow-sm ring-2 ring-white/80"
                      style={{ backgroundColor: activeMemberProfile?.color ?? '#8b6a52' }}
                      title={activeMemberProfile?.name ?? activeMember}
                    >
                      {activeMemberProfile?.initials ?? 'NA'}
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
                  <div className="task-field-shell">
                    <span className="task-field-icon" aria-hidden>
                      ⌁
                    </span>
                    <select
                      value={taskFilterCategory}
                      onChange={(event) => setTaskFilterCategory(event.target.value)}
                      disabled={taskFilterCategories.length === 0}
                      className="task-field-select"
                    >
                      <option value="">Todas</option>
                      {taskFilterCategories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <span className="task-field-caret" aria-hidden>
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
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="metric-label">Tarea realizada</span>
                  <div className="task-field-shell task-field-shell-select">
                    <span className="task-field-icon task-field-icon-select" aria-hidden>
                      ✓
                    </span>
                    <div className="task-field-select-wrap">
                      <select
                        value={taskDescription}
                        onChange={(event) => setTaskDescription(event.target.value)}
                        disabled={filteredCommunityTasks.length === 0}
                        className="task-field-select task-field-select-task"
                      >
                        {communityTasks.length === 0 && <option value="">No hay tareas creadas</option>}
                        {communityTasks.length > 0 && filteredCommunityTasks.length === 0 && (
                          <option value="">No hay tareas para esta categoría</option>
                        )}
                        {filteredCommunityTasks.map((task) => (
                          <option key={task.id} value={task.name}>
                            {task.name}
                          </option>
                        ))}
                      </select>
                      {selectedCommunityTask && (
                        <span
                          className={`task-field-badge rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap ${selectedTaskBadgeClass}`}
                        >
                          {selectedCommunityTask.score} pts
                        </span>
                      )}
                      <span className="task-field-caret task-field-caret-overlay" aria-hidden>
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
                    </div>
                  </div>
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
                <article className="rounded-xl border border-black/10 bg-white/85 p-3">
                  <p className="metric-label">Estado de hoy</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-2xl font-heading text-ink">{todayForActiveMember} tareas</p>
                      <p className="text-xs text-ink/65">Integrante activo en {todayLabel}</p>
                    </div>
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold text-white"
                      style={{ backgroundColor: activeMemberProfile?.color ?? '#8b6a52' }}
                      title={activeMemberProfile?.name ?? activeMember}
                    >
                      {activeMemberProfile?.initials ?? 'NA'}
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
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${getScoreBadgeClass(entry.scoreSnapshot)}`}
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
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-[1.8rem] leading-tight text-ink sm:text-3xl">
                Actividades semanales
              </h2>
              <p className="text-sm text-ink/65">
                Seguimiento de carga por integrante y ritmo de la semana.
              </p>
            </div>
            <span className="w-full rounded-full border border-black/15 bg-white/75 px-3 py-1 text-center text-xs uppercase tracking-[0.15em] text-ink/70 sm:w-auto">
              Semana actual
            </span>
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
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <article className="dashboard-card">
                  <p className="metric-label">Tareas esta semana</p>
                  <p className="metric-value">{weeklyTotal}</p>
                  <p className="metric-note">Acumulado total entre integrantes</p>
                </article>

                <article className="dashboard-card">
                  <p className="metric-label">Lider semanal</p>
                  <p className="metric-value">{topMember?.name ?? '-'}</p>
                  <p className="metric-note">{topMember?.completed ?? 0} tareas completadas</p>
                </article>

                <article className="dashboard-card">
                  <p className="metric-label">Promedio diario</p>
                  <p className="metric-value">{avgTasksPerActiveDay}</p>
                  <p className="metric-note">Solo considerando días activos</p>
                </article>

                <article className="dashboard-card">
                  <p className="metric-label">Desbalance</p>
                  <p className="metric-value">{loadGap}</p>
                  <p className="metric-note">Brecha entre mayor y menor carga</p>
                </article>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <article className="rounded-2xl border border-black/10 bg-white/75 p-2 sm:p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">
                      Ritmo diario y contribución
                    </p>
                    <p className="text-xs text-ink/60">
                      Día con mayor actividad: <strong>{busiestDay.day}</strong> ({busiestDay.total})
                    </p>
                  </div>
                  <div className="h-[280px] sm:h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={dailyOverview} barGap={6}>
                        <CartesianGrid
                          vertical={false}
                          strokeDasharray="3 6"
                          stroke="rgba(94, 74, 59, 0.2)"
                        />
                        <XAxis
                          dataKey="day"
                          tick={{ fill: '#5b4537', fontSize: 12, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: '#5b4537', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(128, 98, 76, 0.09)' }}
                          contentStyle={{
                            borderRadius: '14px',
                            border: '1px solid rgba(88, 67, 51, 0.18)',
                            boxShadow: '0 20px 45px -25px rgba(90, 58, 36, 0.34)',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', textTransform: 'uppercase' }} />

                        {data.members.map((member) => (
                          <Bar
                            key={member.name}
                            dataKey={member.name}
                            name={member.name}
                            fill={member.color}
                            radius={[7, 7, 0, 0]}
                            maxBarSize={28}
                          />
                        ))}

                        <Line
                          type="monotone"
                          dataKey="total"
                          name="Total diario"
                          stroke="#51392d"
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 1, fill: '#ffffff' }}
                          activeDot={{ r: 5 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article className="space-y-4 rounded-2xl border border-black/10 bg-white/75 p-4">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/70">
                      Distribución semanal
                    </p>
                    <p className="text-xs text-ink/60">
                      Participación relativa por integrante en el total.
                    </p>
                  </div>

                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={2}
                        >
                          {donutData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: '14px',
                            border: '1px solid rgba(88, 67, 51, 0.18)',
                            boxShadow: '0 20px 45px -25px rgba(90, 58, 36, 0.34)',
                          }}
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
                        <tr key={day.day} className="rounded-xl">
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
  const palettes: RecentLogTone[] = [
    {
      accent: 'oklch(0.658 0.118 47)',
      border: 'rgba(177, 103, 70, 0.2)',
      chip: 'rgba(255, 247, 240, 0.92)',
      soft: 'rgba(250, 236, 226, 0.9)',
    },
    {
      accent: 'oklch(0.675 0.074 149)',
      border: 'rgba(112, 142, 94, 0.22)',
      chip: 'rgba(245, 251, 243, 0.92)',
      soft: 'rgba(228, 241, 223, 0.9)',
    },
    {
      accent: 'oklch(0.735 0.088 84)',
      border: 'rgba(176, 146, 78, 0.22)',
      chip: 'rgba(255, 250, 235, 0.92)',
      soft: 'rgba(247, 239, 211, 0.9)',
    },
    {
      accent: 'oklch(0.604 0.112 28)',
      border: 'rgba(170, 92, 82, 0.22)',
      chip: 'rgba(255, 244, 242, 0.92)',
      soft: 'rgba(247, 226, 223, 0.9)',
    },
  ];

  const normalized = categoryName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const tone = palettes[hash % palettes.length];

  return {
    '--recent-log-accent': tone.accent,
    '--recent-log-border': tone.border,
    '--recent-log-chip': tone.chip,
    '--recent-log-soft': tone.soft,
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
