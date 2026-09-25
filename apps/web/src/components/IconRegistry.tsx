import React from 'react'
import * as Lucide from 'lucide-react'

export type IconRegistryName = keyof typeof Lucide

export interface IconRegistryProps {
  readonly name: IconRegistryName | string | undefined | null
  readonly className?: string
  readonly size?: number
  readonly strokeWidth?: number
}

export function IconRegistry({ name, className, size = 20, strokeWidth = 2 }: IconRegistryProps) {
  if (!name) return null
  const safe = String(name)
  const icons = Lucide as unknown as Record<string, React.ComponentType<any>>;
  const Component = icons[safe];
  if (Component) {
    return <Component className={className} size={size} strokeWidth={strokeWidth} />;
  }
  // Try to find by case-insensitive match (e.g., "bank" -> "Bank" or "Banknote")
  const keys = Object.keys(Lucide);
  const direct = keys.find((k) => k.toLowerCase() === safe.toLowerCase());
  if (direct) {
    const Cmp = icons[direct];
    if (Cmp) return <Cmp className={className} size={size} strokeWidth={strokeWidth} />;
  }
  const partial = keys.find((k) => k.toLowerCase().includes(safe.toLowerCase()));
  if (partial) {
    const Cmp = icons[partial];
    if (Cmp) return <Cmp className={className} size={size} strokeWidth={strokeWidth} />;
  }
  return null;
}



