import { getMGIColor, formatMGI } from '../../utils/mgiUtils';

interface MgiOverlayBadgeProps {
  mgiScore: number | null | undefined;
  size?: 'thumb' | 'main';
  className?: string;
}

export default function MgiOverlayBadge({
  mgiScore,
  size = 'thumb',
  className = '',
}: MgiOverlayBadgeProps) {
  if (mgiScore == null) return null;

  const color = getMGIColor(mgiScore);
  const label = formatMGI(mgiScore);

  if (size === 'thumb') {
    return (
      <span
        className={`absolute bottom-0.5 right-0.5 px-1 py-px rounded text-[8px] font-bold leading-tight text-white shadow-sm ${className}`}
        style={{ backgroundColor: color }}
        title={`MGI: ${label}`}
      >
        {label}
      </span>
    );
  }

  return (
    <div
      className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-white shadow-lg ${className}`}
      style={{ backgroundColor: color }}
    >
      <span className="opacity-80">MGI:</span>
      <span>{label}</span>
    </div>
  );
}
