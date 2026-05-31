import type { DeadlineLevel } from '@/lib/deadlines';

const STYLES: Record<DeadlineLevel, string> = {
  done: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  ok: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  soon: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  overdue: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
};

const DOT: Record<DeadlineLevel, string> = {
  done: 'bg-green-500',
  ok: 'bg-green-500',
  soon: 'bg-amber-500',
  overdue: 'bg-red-500',
};

/** Kleine Ampel-Plakette für eine Frist. */
export function DeadlineBadge({ level, label }: { level: DeadlineLevel; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[level]}`}
    >
      <span className={`h-2 w-2 rounded-full ${DOT[level]}`} aria-hidden />
      {label}
    </span>
  );
}
