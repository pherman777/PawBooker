import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

type Tone = 'sage' | 'clay' | 'success' | 'warning' | 'danger' | 'muted';

type Props = {
  icon: LucideIcon;
  tone?: Tone;
  size?: number;
};

const TONE_VAR: Record<Tone, string> = {
  sage: 'var(--sage)',
  clay: 'var(--clay)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--muted)',
};

// Marketing site's icon "chip" (public/styles/site.css's `.card .ic`) -
// tinted rounded square housing a stroked icon.
export function IconChip({ icon: Icon, tone = 'sage', size = 44 }: Props) {
  const color = TONE_VAR[tone];
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
    backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
  };
  return (
    <span className="icon-chip" style={style}>
      <Icon size={Math.round(size * 0.5)} color={color} strokeWidth={2} />
    </span>
  );
}
