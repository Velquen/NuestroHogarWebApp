import { useMemo } from 'react';
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

function App() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['community-dashboard'],
    queryFn: fetchCommunityDashboard,
  });

  const totalsByMember = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.members.map((member) => {
      const completed = data.weeklyActivities.reduce((acc, day) => acc + day[member.name], 0);
      return {
        ...member,
        completed,
      };
    });
  }, [data]);

  const dailyOverview = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.weeklyActivities.map((day) => {
      const total = data.members.reduce((acc, member) => acc + day[member.name], 0);
      return {
        ...day,
        total,
      };
    });
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

  return (
    <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="bg-orb-1" aria-hidden />
      <div className="bg-orb-2" aria-hidden />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header id="dashboard-menu" className="panel animate-rise p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-4 border-b border-black/10 pb-4">
            <p className="font-heading text-lg tracking-[0.2em] text-ink/70">MENU</p>
            <span className="rounded-full border border-black/15 bg-white/80 px-3 py-1 text-xs uppercase tracking-[0.14em] text-ink/70">
              Dashboard comunitario
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              id="btn-mis-comunidades"
              type="button"
              className="rounded-full border border-black/15 bg-white/75 px-4 py-2 text-sm font-medium text-ink/80 transition hover:border-black/30 hover:bg-white"
            >
              Mis Comunidades
            </button>
            <button
              id="btn-perfil"
              type="button"
              className="transition hover:scale-105"
              aria-label="Perfil"
            >
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full text-[22px] font-semibold text-white shadow-sm"
                style={{ backgroundColor: profileMember?.color ?? '#64748b' }}
                aria-hidden
              >
                {profileMember?.initials ?? 'P'}
              </span>
            </button>
          </div>
        </header>

        <section
          id="dashboard-comunidad"
          className="panel animate-rise p-5 [animation-delay:90ms] sm:p-8"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-ink/60">Comunidad</p>
          <h1 className="font-heading text-4xl text-ink sm:text-5xl">
            {data?.communityName ?? 'Cargando comunidad...'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/70 sm:text-base">
            Vista general de tareas del hogar, integrantes activos y progreso semanal.
          </p>
        </section>

        <section
          id="dashboard-integrantes"
          className="panel animate-rise p-5 [animation-delay:180ms] sm:p-8"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-heading text-3xl text-ink">Integrantes</h2>
            <span className="rounded-full bg-black/80 px-3 py-1 text-xs uppercase tracking-[0.15em] text-white">
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
            <div className="grid gap-4 sm:grid-cols-3">
              {totalsByMember.map((member) => (
                <article
                  key={member.name}
                  className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-mellow transition hover:-translate-y-1"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold text-white"
                      style={{ backgroundColor: member.color }}
                    >
                      {member.initials}
                    </span>
                    <span className="rounded-full bg-black/10 px-3 py-1 text-xs uppercase tracking-[0.13em] text-ink/70">
                      {member.completed} tareas
                    </span>
                  </div>
                  <h3 className="font-heading text-2xl text-ink">{member.name}</h3>
                  <p className="text-sm text-ink/65">{member.role}</p>
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

        <section
          id="dashboard-resumen-semanal"
          className="panel animate-rise p-5 [animation-delay:270ms] sm:p-8"
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
                <article id="dashboard-kpi-tareas-semana" className="dashboard-card">
                  <p className="metric-label">Tareas esta semana</p>
                  <p className="metric-value">{weeklyTotal}</p>
                  <p className="metric-note">Acumulado total entre integrantes</p>
                </article>

                <article id="dashboard-kpi-lider-semanal" className="dashboard-card">
                  <p className="metric-label">Lider semanal</p>
                  <p className="metric-value">{topMember?.name ?? '-'}</p>
                  <p className="metric-note">{topMember?.completed ?? 0} tareas completadas</p>
                </article>

                <article id="dashboard-kpi-promedio-diario" className="dashboard-card">
                  <p className="metric-label">Promedio diario</p>
                  <p className="metric-value">{avgTasksPerActiveDay}</p>
                  <p className="metric-note">Solo considerando días activos</p>
                </article>

                <article id="dashboard-kpi-desbalance" className="dashboard-card">
                  <p className="metric-label">Desbalance</p>
                  <p className="metric-value">{loadGap}</p>
                  <p className="metric-note">Brecha entre mayor y menor carga</p>
                </article>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <article
                  id="dashboard-grafico-ritmo-contribucion"
                  className="rounded-2xl border border-black/10 bg-white/75 p-2 sm:p-4"
                >
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
                          stroke="rgba(30, 41, 59, 0.2)"
                        />
                        <XAxis
                          dataKey="day"
                          tick={{ fill: '#1f2937', fontSize: 12, fontWeight: 600 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fill: '#1f2937', fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={{ fill: 'rgba(100, 116, 139, 0.08)' }}
                          contentStyle={{
                            borderRadius: '14px',
                            border: '1px solid rgba(15, 23, 42, 0.12)',
                            boxShadow: '0 20px 45px -25px rgba(24, 39, 75, 0.35)',
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
                          stroke="#06b6d4"
                          strokeOpacity={0.55}
                          strokeWidth={2.5}
                          dot={{ r: 3, strokeWidth: 1, fill: '#ffffff' }}
                          activeDot={{ r: 5 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </article>

                <article
                  id="dashboard-distribucion"
                  className="space-y-4 rounded-2xl border border-black/10 bg-white/75 p-4"
                >
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
                            border: '1px solid rgba(15, 23, 42, 0.12)',
                            boxShadow: '0 20px 45px -25px rgba(24, 39, 75, 0.35)',
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

              <article id="dashboard-matriz-diaria" className="rounded-2xl border border-black/10 bg-white/75 p-4">
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
                                    color: tasks > 0 ? '#ffffff' : 'rgba(30, 41, 59, 0.75)',
                                    backgroundColor:
                                      tasks > 0
                                        ? hexToRgba(member.color, alpha)
                                        : 'rgba(15, 23, 42, 0.07)',
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
    </div>
  );
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
