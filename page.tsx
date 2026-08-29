const tasks = [
  { title: "Boodschappen doen", person: "Jij", category: "Boodschappen", priority: "Normaal" },
  { title: "Was ophangen", person: "Samen", category: "Huis", priority: "Hoog" },
  { title: "Container buiten zetten", person: "Vriendin", category: "Huis", priority: "Normaal" }
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden">
      <div className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-8">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Shared Todo</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Vandaag 👋</h1>
          </div>
          <button className="rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-bold shadow-sm transition hover:-translate-y-0.5">
            + Taak
          </button>
        </header>

        <section className="relative mt-8 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border-[32px] border-[var(--accent)] opacity-40" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-12 h-44 w-44 rotate-12 rounded-[35%] border-[18px] border-[var(--foreground)] opacity-5" />
          <p className="relative text-sm font-medium text-[var(--muted)]">Samen waar gewenst. Privé waar nodig.</p>
          <h2 className="relative mt-2 max-w-2xl text-2xl font-extrabold sm:text-3xl">
            Eén rustige plek voor jullie taken, agenda en herinneringen.
          </h2>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-extrabold">Taken</h2>
              <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-bold">Vandaag</span>
            </div>
            <div className="space-y-3">
              {tasks.map((task) => (
                <article key={task.title} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/60 p-4">
                  <button aria-label={`Markeer ${task.title} als voltooid`} className="h-6 w-6 shrink-0 rounded-full border-2 border-[var(--foreground)]" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold">{task.title}</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">{task.category} · {task.person}</p>
                  </div>
                  <span className="hidden rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold sm:block">{task.priority}</span>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[1.75rem] border border-[var(--border)] bg-[var(--foreground)] p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-60">Volgende</p>
            <h2 className="mt-2 text-2xl font-extrabold">Agenda</h2>
            <div className="mt-6 rounded-2xl bg-white/10 p-4">
              <p className="text-sm opacity-70">17:00</p>
              <p className="mt-1 font-bold">Restaurant</p>
              <p className="mt-1 text-xs opacity-60">Gedeeld met jullie twee</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
