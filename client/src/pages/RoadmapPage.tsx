import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import IdeasBox from '../roadmap/IdeasBox';
import { useRoadmap } from '../roadmap/useRoadmap';
import {
  allTasks, countTasks, featureStatus, STATUS_LABEL,
  type Feature, type Phase, type Status,
} from '../roadmap/types';
import './roadmap.css';

type Filter = 'todas' | Status;
const FILTERS: Filter[] = ['todas', 'en_progreso', 'pendiente', 'hecho'];
const FILTER_LABEL: Record<Filter, string> = { todas: 'Todas', ...STATUS_LABEL };

function ProgressBar({ done, doing, total }: { done: number; doing: number; total: number }) {
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div className="bar" role="progressbar" aria-valuenow={Math.round(pct(done))} aria-valuemin={0} aria-valuemax={100}>
      <span className="bar-done" style={{ width: `${pct(done)}%` }} />
      <span className="bar-doing" style={{ width: `${pct(doing)}%` }} />
    </div>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const [open, setOpen] = useState(false);
  const status = featureStatus(feature);
  const { done, total } = countTasks(feature.tasks);
  return (
    <article className={`card st-${status}`}>
      <button className="card-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="card-top">
          <span className={`tag tag-${feature.category}`}>{feature.category}</span>
          <span className="count">{done}/{total}</span>
        </span>
        <span className="card-title">{feature.title}</span>
        <span className="card-status">
          <i className="dot" />
          {STATUS_LABEL[status]}
          <b className="chev">{open ? '▴' : '▾'}</b>
        </span>
      </button>
      {open && (
        <ul className="tasks">
          {feature.tasks.map((t) => (
            <li key={t.id} className={`task st-${t.status}`}>
              <i className="dot" />
              <span>
                {t.title}
                {t.note && <em> · {t.note}</em>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function PhaseColumn({ phase, filter }: { phase: Phase; filter: Filter }) {
  const stats = countTasks(allTasks(phase.features));
  const features = phase.features.filter((f) => filter === 'todas' || featureStatus(f) === filter);
  return (
    <section className="col">
      <header className="col-head">
        <h2>{phase.name}{phase.release && <span className="rel">v{phase.release}</span>}</h2>
        <p>{phase.summary}</p>
        <ProgressBar {...stats} />
        <small>{stats.done} de {stats.total} tareas</small>
      </header>
      <div className="col-body">
        {features.length
          ? features.map((f) => <FeatureCard key={f.id} feature={f} />)
          : <p className="empty">Sin elementos</p>}
      </div>
    </section>
  );
}

export default function RoadmapPage() {
  const { data, error } = useRoadmap();
  const [filter, setFilter] = useState<Filter>('todas');
  const stats = useMemo(
    () => (data ? countTasks(data.phases.flatMap((p) => allTasks(p.features))) : null),
    [data],
  );

  return (
    <div className="rm">
      <header className="rm-top">
        <div>
          <Link to="/" className="rm-back">← MAR</Link>
          <h1>Roadmap{data?.release && <span className="rel big">v{data.release}</span>}</h1>
          <p>{data?.subtitle ?? 'Cargando…'}</p>
        </div>
        {stats && (
          <div className="rm-global">
            <strong>{stats.total ? Math.round((stats.done / stats.total) * 100) : 0}%</strong>
            <ProgressBar {...stats} />
            <small>
              {stats.done} hechas · {stats.doing} en curso · {stats.total - stats.done - stats.doing} pendientes
            </small>
          </div>
        )}
      </header>

      <nav className="filters" aria-label="Filtrar por estado">
        {FILTERS.map((f) => (
          <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>
            {FILTER_LABEL[f]}
          </button>
        ))}
        <span className="live"><i className="dot" />En vivo{data ? ` · ${data.updatedAt}` : ''}</span>
      </nav>

      {error && <p className="rm-error">{error}</p>}
      <IdeasBox />
      <main className="cols">
        {data?.phases.map((p) => <PhaseColumn key={p.id} phase={p} filter={filter} />)}
      </main>
    </div>
  );
}
