import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva('rounded-[6px]', {
  variants: {
    variant: {
      default: 'bg-elevated text-fg-primary border-border-strong',
      secondary: 'bg-surface text-fg-secondary border-border-strong',
      brand: 'bg-brand-bg text-ink-primary border-ink-primary/25',
      info: 'bg-status-info-bg text-status-info-fg border-status-info-fg/25',
      success: 'bg-status-good-bg text-status-good-fg border-status-good-fg/25',
      warning: 'bg-status-warn-bg text-status-warn-fg border-status-warn-fg/25',
      danger: 'bg-status-bad-bg text-status-bad-fg border-status-bad-fg/25',
      outline: 'bg-[transparent] text-fg-paragraph border-border-strong',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type BadgeProps = React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  };

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  if (asChild) {
    return (
      <Slot
        data-slot="badge"
        {...props}
        className={cn(badgeVariants({ variant }), className)}
      />
    );
  }
  return (
    <span
      data-slot="badge"
      {...props}
      className={cn(badgeVariants({ variant }), className)}
    />
  );
}

export { Badge, badgeVariants };
