import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { fetchCommunityDashboard } from './api/community';
import type { MemberName } from './types/community';

interface LoggedTask {
  id: string;
  member: MemberName;
  date: string;
  day: string;
  task: string;
  count: number;
}

interface CommunityTask {
  id: string;
  name: string;
  category: string;
  score: number;
  createdAt: string;
}

type ToastVariant = 'success' | 'error';

interface AppToast {
  id: string;
  message: string;
  variant: ToastVariant;
}

const initialCommunityTasks: CommunityTask[] = [
  {
    id: 'task-base-1',
    name: 'Lavar platos',
    category: 'Cocina',
    score: 4,
    createdAt: getTodayIsoDate(),
  },
  {
    id: 'task-base-2',
    name: 'Sacar basura',
    category: 'Limpieza',
    score: 3,
    createdAt: getTodayIsoDate(),
  },
  {
    id: 'task-base-3',
    name: 'Limpiar baño',
    category: 'Baño',
    score: 6,
    createdAt: getTodayIsoDate(),
  },
];
const initialTaskCategories = Array.from(new Set(initialCommunityTasks.map((task) => task.category)));

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

function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-dashboard'],
    queryFn: fetchCommunityDashboard,
  });

  const [taskDate, setTaskDate] = useState(() => getTodayIsoDate());
  const [taskDescription, setTaskDescription] = useState('');
  const [taskCount, setTaskCount] = useState(1);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [taskEntries, setTaskEntries] = useState<LoggedTask[]>([]);
  const [communityTasks, setCommunityTasks] = useState<CommunityTask[]>(initialCommunityTasks);
  const [communityTaskName, setCommunityTaskName] = useState('');
  const [taskCategories, setTaskCategories] = useState<string[]>(initialTaskCategories);
  const [communityTaskCategory, setCommunityTaskCategory] = useState(initialTaskCategories[0] ?? '');
  const [isCreateCategoryOpen, setIsCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [communityTaskScore, setCommunityTaskScore] = useState(4);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [isMobileTasksOpen, setIsMobileTasksOpen] = useState(false);
  const [isMobileCreateTaskOpen, setIsMobileCreateTaskOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<CommunityTask | null>(null);

  const selectedDayLabel = useMemo(() => toDayLabel(taskDate), [taskDate]);
  const todayLabel = useMemo(() => toDayLabel(getTodayIsoDate()), []);
  const todayIsoDate = useMemo(() => getTodayIsoDate(), []);

  const weeklyActivities = useMemo(() => {
    if (!data) {
      return [];
    }

    const merged = data.weeklyActivities.map((day) => ({ ...day }));

    for (const entry of taskEntries) {
      const dayRecord = merged.find((day) => day.day === entry.day);
      if (dayRecord) {
        dayRecord[entry.member] += entry.count;
      }
    }

    return merged;
  }, [data, taskEntries]);

  const totalsByMember = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.members.map((member) => {
      const completed = weeklyActivities.reduce((acc, day) => acc + day[member.name], 0);
      return {
        ...member,
        completed,
      };
    });
  }, [data, weeklyActivities]);

  const dailyOverview = useMemo(() => {
    if (!data) {
      return [];
    }

    return weeklyActivities.map((day) => {
      const total = data.members.reduce((acc, member) => acc + day[member.name], 0);
      return {
        ...day,
        total,
      };
    });
  }, [data, weeklyActivities]);

  const memberColorMap = useMemo(() => {
    if (!data) {
      return {} as Record<MemberName, string>;
    }

    return data.members.reduce(
      (acc, member) => {
        acc[member.name] = member.color;
        return acc;
      },
      {} as Record<MemberName, string>,
    );
  }, [data]);

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

  const profileMember = data?.members[0];
  const activeMember: MemberName = profileMember?.name ?? 'Gaspar';
  const activeMemberProfile = profileMember;

  const todayForActiveMember = useMemo(() => {
    if (!dailyOverview.length) {
      return 0;
    }

    const dayRecord = dailyOverview.find((day) => day.day === todayLabel);
    return dayRecord ? dayRecord[activeMember] : 0;
  }, [dailyOverview, activeMember, todayLabel]);

  const isTodaySelected = taskDate === todayIsoDate;
  const selectedCommunityTask = useMemo(
    () => communityTasks.find((task) => task.name === taskDescription) ?? null,
    [communityTasks, taskDescription],
  );
  const selectedTaskBadgeClass = selectedCommunityTask
    ? getScoreBadgeClass(selectedCommunityTask.score)
    : 'border-black/12 bg-white/70 text-ink/60';
  const createTaskScoreBadgeClass = getScoreBadgeClass(communityTaskScore);

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

  const memberNameByDataKey: Record<MemberName, string> = {
    Gaspar: 'Gaspar',
    Cristobal: 'Cristobal',
    Fernanda: 'Fernanda',
  };

  useEffect(() => {
    if (!taskDescription && communityTasks.length > 0) {
      setTaskDescription(communityTasks[0].name);
    }
  }, [communityTasks, taskDescription]);

  useEffect(() => {
    if (!communityTaskCategory && taskCategories.length > 0) {
      setCommunityTaskCategory(taskCategories[0]);
      return;
    }

    if (communityTaskCategory && !taskCategories.includes(communityTaskCategory)) {
      setCommunityTaskCategory(taskCategories[0] ?? '');
    }
  }, [taskCategories, communityTaskCategory]);

  const showToast = (message: string, variant: ToastVariant = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setToasts((previous) => [...previous, { id, message, variant }]);

    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const handleTaskSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const description = taskDescription.trim();
    if (!description) {
      setFormMessage('Escribe una tarea antes de registrar.');
      return;
    }

    const safeCount = Math.max(1, Math.floor(taskCount));
    const dayLabel = toDayLabel(taskDate);

    const newEntry: LoggedTask = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      member: activeMember,
      date: taskDate,
      day: dayLabel,
      task: description,
      count: safeCount,
    };

    setTaskEntries((prev) => [newEntry, ...prev].slice(0, 10));
    if (communityTasks.length > 0) {
      setTaskDescription(communityTasks[0].name);
    } else {
      setTaskDescription('');
    }
    setTaskCount(1);
    setFormMessage(`Registrado: ${safeCount} tarea(s) para el integrante activo en ${dayLabel}.`);
  };

  const handleCommunityTaskCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
    const newTask: CommunityTask = {
      id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      category,
      score: safeScore,
      createdAt: getTodayIsoDate(),
    };

    setCommunityTasks((prev) => [newTask, ...prev]);
    setCommunityTaskName('');
    setCommunityTaskScore(4);
    showToast(`Tarea creada: "${name}" (${category}) con puntuación ${safeScore}.`);
  };

  const handleCategoryCreate = () => {
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

    setTaskCategories((previous) => [categoryName, ...previous]);
    setCommunityTaskCategory(categoryName);
    setNewCategoryName('');
    setIsCreateCategoryOpen(false);
    showToast(`Categoría creada: "${categoryName}".`);
  };

  const handleConfirmDeleteTask = () => {
    if (!taskToDelete) {
      return;
    }

    setCommunityTasks((previous) => {
      const next = previous.filter((task) => task.id !== taskToDelete.id);
      const selectedTaskStillExists = next.some((task) => task.name === taskDescription);

      if (!selectedTaskStillExists) {
        setTaskDescription(next[0]?.name ?? '');
      }

      return next;
    });

    showToast(`Tarea eliminada: "${taskToDelete.name}".`);
    setTaskToDelete(null);
  };

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
    <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="bg-orb-1" aria-hidden />
      <div className="bg-orb-2" aria-hidden />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header id="dashboard-menu" className="panel animate-rise p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <button
              id="btn-mis-comunidades"
              type="button"
              className="group inline-flex items-center gap-3 rounded-2xl border border-amber-800/20 bg-gradient-to-br from-amber-50/95 to-orange-100/80 px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-800/35 hover:shadow-md"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700/90 text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 3a4 4 0 1 1 0 8a4 4 0 0 1 0-8m-7 3a3 3 0 1 1 0 6a3 3 0 0 1 0-6m14 0a3 3 0 1 1 0 6a3 3 0 0 1 0-6m-7 7c3.22 0 5.95 1.57 7.02 3.75A1 1 0 0 1 18.13 18H5.87a1 1 0 0 1-.9-1.25C6.05 14.57 8.78 13 12 13m-7 .5c.84 0 1.63.14 2.34.4a8.3 8.3 0 0 0-2.13 3.1H2.5a1 1 0 0 1-.9-1.43C2.3 14.32 3.58 13.5 5 13.5m14 0c1.42 0 2.7.82 3.4 2.07A1 1 0 0 1 21.5 17h-2.71a8.3 8.3 0 0 0-2.13-3.1c.71-.26 1.5-.4 2.34-.4"
                  />
                </svg>
              </span>
              <span className="leading-tight">
                <span className="font-heading text-xl text-amber-950/90">Mis Comunidades</span>
              </span>
            </button>
            <button
              id="btn-perfil"
              type="button"
              className="transition hover:scale-105"
              aria-label="Perfil"
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full text-[22px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: profileMember?.color ?? '#8b6a52' }}
                aria-hidden
              >
                {profileMember?.initials ?? 'P'}
              </span>
            </button>
          </div>
        </header>

        <section id="comunidad" className="panel animate-rise p-5 [animation-delay:90ms] sm:p-8">
          <p className="text-xs uppercase tracking-[0.18em] text-ink/60">Comunidad</p>
          <h1 className="font-heading text-4xl text-ink sm:text-5xl">
            {data?.communityName ?? 'Cargando comunidad...'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/70 sm:text-base">
            Vista general de tareas del hogar, integrantes activos y progreso semanal.
          </p>
        </section>

        <section
          id="tareas-comunidad"
          className="panel animate-rise p-5 [animation-delay:130ms] sm:p-8"
        >
          <div className="mb-5">
            <h2 className="font-heading text-3xl text-ink">Tareas de la Comunidad</h2>
            <p className="text-sm text-ink/65">
              Gestiona el listado de tareas creadas y agrega nuevas tareas con puntuación.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <article className="space-y-3 rounded-2xl border border-black/10 bg-white/80 p-4">
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
                    <div className="task-list-stack lg:hidden">{communityTasks.map(renderCommunityTask)}</div>

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
              className="space-y-4 rounded-2xl border border-black/10 bg-white/80 p-4"
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

              <div className={`${isMobileCreateTaskOpen ? 'space-y-4' : 'hidden'} lg:block`}>
                <p className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-ink/70">
                  Define la tarea y su puntaje para que aparezca en "Tarea realizada".
                </p>

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

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="metric-label">Categoría</span>
                    <button
                      type="button"
                      onClick={() => setIsCreateCategoryOpen((previous) => !previous)}
                      className="rounded-md border border-black/15 bg-white px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/70 transition hover:border-black/30"
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
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 bg-white/85 p-2.5">
                      <input
                        type="text"
                        placeholder="Ej: Exteriores"
                        value={newCategoryName}
                        onChange={(event) => setNewCategoryName(event.target.value)}
                        className="min-w-[170px] flex-1 rounded-lg border border-black/12 bg-white px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-black/30"
                      />
                      <button
                        type="button"
                        onClick={handleCategoryCreate}
                        className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink/75 transition hover:border-black/30"
                      >
                        Crear
                      </button>
                    </div>
                  )}
                </div>

                <label className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="metric-label">Puntuación (2 a 7)</span>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${createTaskScoreBadgeClass}`}
                    >
                      {communityTaskScore} pts
                    </span>
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

                <article className="rounded-xl border border-black/10 bg-white/85 p-3">
                  <p className="metric-label">Vista previa</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink/85">
                        {communityTaskName.trim() || 'Nombre pendiente'}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-ink/55">
                        {communityTaskCategory || 'Categoría pendiente'}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${createTaskScoreBadgeClass}`}
                    >
                      {communityTaskScore} pts
                    </span>
                  </div>
                </article>

                <div className="flex justify-center">
                  <button type="submit" className="btn-primary inline-flex items-center justify-center">
                    Guardar tarea
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section id="integrantes" className="panel animate-rise p-5 [animation-delay:180ms] sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-heading text-3xl text-ink">Integrantes</h2>
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
                      <h3 className="truncate font-heading text-2xl leading-none text-ink sm:text-[2rem]">
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

        <section id="registro-diario" className="panel animate-rise p-5 [animation-delay:225ms] sm:p-8">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-3xl text-ink">Registro del día</h2>
              <p className="text-sm text-ink/65">
                Completa tareas del integrante activo. Por defecto se guarda para hoy, pero puedes
                registrar otro día.
              </p>
            </div>
            <span className="rounded-full border border-black/15 bg-white/75 px-3 py-1 text-xs uppercase tracking-[0.15em] text-ink/70">
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
                className="space-y-4 rounded-2xl border border-black/10 bg-white/80 p-4"
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
                        disabled={communityTasks.length === 0}
                        className="task-field-select task-field-select-task"
                      >
                        {communityTasks.length === 0 && <option value="">No hay tareas creadas</option>}
                        {communityTasks.map((task) => (
                          <option key={task.id} value={task.name}>
                            {task.name} · {task.category}
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

                <label className="space-y-2 sm:max-w-[220px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="metric-label">Cantidad</span>
                    <span className="rounded-md border border-black/10 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink/60">
                      Máx 20
                    </span>
                  </div>
                  <div className="task-field-shell">
                    <span className="task-field-icon" aria-hidden>
                      #
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={taskCount}
                      onChange={(event) => setTaskCount(Number(event.target.value) || 1)}
                      className="task-field-number"
                    />
                  </div>
                </label>

                <div className="flex justify-center">
                  <button type="submit" className="btn-primary inline-flex items-center justify-center">
                    Registrar tarea
                  </button>
                </div>

                {formMessage && (
                  <p className="rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-sm text-ink/75">
                    {formMessage}
                  </p>
                )}
              </form>

              <aside className="space-y-4 rounded-2xl border border-black/10 bg-white/80 p-4">
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
                  <p className="metric-label">Últimos registros manuales</p>
                  <div className="mt-2 space-y-2">
                    {taskEntries.length === 0 && (
                      <p className="rounded-xl border border-dashed border-black/20 bg-white/70 px-3 py-2 text-sm text-ink/60">
                        Aún no hay registros manuales.
                      </p>
                    )}

                    {taskEntries.slice(0, 5).map((entry) => (
                      <article
                        key={entry.id}
                        className="rounded-xl border border-black/10 bg-white/85 px-3 py-2"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white"
                            style={{ backgroundColor: memberColorMap[entry.member] ?? '#8b6a52' }}
                          >
                            {entry.member}
                          </span>
                          <span className="text-[11px] text-ink/60">
                            {entry.day}, {formatDateLabel(entry.date)}
                          </span>
                        </div>
                        <p className="text-sm text-ink/80">{entry.task}</p>
                        <p className="text-xs text-ink/65">{entry.count} tarea(s) sumadas</p>
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
          className="panel animate-rise p-5 [animation-delay:300ms] sm:p-8"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-heading text-3xl text-ink">Actividades semanales</h2>
              <p className="text-sm text-ink/65">
                Seguimiento de carga por integrante y ritmo de la semana.
              </p>
            </div>
            <span className="rounded-full border border-black/15 bg-white/75 px-3 py-1 text-xs uppercase tracking-[0.15em] text-ink/70">
              Semana actual
            </span>
          </div>

          {isLoading && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 animate-pulse rounded-2xl border border-black/10 bg-white/60"
                  />
                ))}
              </div>
              <div className="h-[360px] animate-pulse rounded-2xl border border-black/10 bg-white/60" />
            </div>
          )}

          {!isLoading && !isError && data && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <div className="h-[360px]">
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
                            name={memberNameByDataKey[member.name]}
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
                  <table className="w-full min-w-[620px] border-separate border-spacing-y-2 text-sm">
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
                            const tasks = day[member.name];
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
        <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
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
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium text-ink/80 transition hover:border-black/30"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTask}
                className="rounded-lg border border-red-300 bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
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
