import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[6px] border-[1px] border-solid px-2.5 py-1 text-[13px] font-semibold leading-tight',
  {
    variants: {
      variant: {
        default: 'bg-elevated text-fg-primary border-border-strong',
        secondary: 'bg-surface text-fg-secondary border-border-strong',
        success:
          'bg-status-good-bg text-status-good-fg border-status-good-fg/25',
        warning:
          'bg-status-warn-bg text-status-warn-fg border-status-warn-fg/25',
        danger: 'bg-status-bad-bg text-status-bad-fg border-status-bad-fg/25',
        outline: 'bg-[transparent] text-fg-paragraph border-border-strong',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
