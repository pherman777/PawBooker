import type { CSSProperties, ReactNode } from 'react';

type Props = {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
};

export function Card({ children, style, className }: Props) {
  return (
    <div className={`card${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}
