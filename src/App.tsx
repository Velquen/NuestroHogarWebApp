import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchCommunityDashboard } from './api/community';

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
      const completed = data.weeklyActivities.reduce(
        (acc, day) => acc + day[member.name],
        0,
      );

      return {
        ...member,
        completed,
      };
    });
  }, [data]);

  return (
    <div className="relative isolate min-h-screen overflow-hidden px-4 py-8 sm:px-8">
      <div className="bg-orb-1" aria-hidden />
      <div className="bg-orb-2" aria-hidden />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header id="menu" className="panel animate-rise p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-4 border-b border-black/10 pb-4">
            <p className="font-heading text-lg tracking-[0.2em] text-ink/70">MENU</p>
            <span className="rounded-full border border-black/15 bg-white/80 px-3 py-1 text-xs uppercase tracking-[0.14em] text-ink/70">
              Dashboard comunitario
            </span>
          </div>

          <button
            type="button"
            className="group w-full rounded-2xl border border-black/15 bg-white/70 px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-black/35 hover:shadow-mellow"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-ink/60">Opción</p>
            <p className="font-heading text-2xl text-ink">Perfil</p>
            <p className="text-sm text-ink/70">Administra tu identidad en la comunidad.</p>
          </button>
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

        <section id="integrantes" className="panel animate-rise p-5 [animation-delay:180ms] sm:p-8">
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
          id="actividades-semanales"
          className="panel animate-rise p-5 [animation-delay:270ms] sm:p-8"
        >
          <div className="mb-5">
            <h2 className="font-heading text-3xl text-ink">Actividades semanales</h2>
            <p className="text-sm text-ink/65">
              Registro por día de tareas completadas por cada integrante.
            </p>
          </div>

          {isLoading && (
            <div className="h-[360px] animate-pulse rounded-2xl border border-black/10 bg-white/60" />
          )}

          {!isLoading && !isError && data && (
            <div className="h-[360px] rounded-2xl border border-black/10 bg-white/70 p-2 sm:p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weeklyActivities} barGap={4}>
                  <CartesianGrid vertical={false} strokeDasharray="3 6" stroke="rgba(30, 41, 59, 0.2)" />
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
                      fill={member.color}
                      radius={[10, 10, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {isError && (
            <p className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              No fue posible cargar el gráfico semanal.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
