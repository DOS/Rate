import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// DESIGN.md Principle #5: every button uses var(--rate-radius-btn) (8px),
// never 999px / rounded-full. Structural display/border/focus rules live in
// tailwind.css @layer components ([data-slot='button']) so utility overrides
// win cleanly while keeping SSR HTML and RSC payloads compact.
const buttonVariants = cva('rounded-[var(--rate-radius-btn)]', {
  variants: {
    variant: {
      primary:
        'bg-brand text-brand-fg hover:bg-brand-hover hover:text-brand-fg',
      secondary:
        'bg-fg-primary text-canvas border-fg-primary hover:bg-fg-primary/90 hover:text-canvas',
      'outline-primary':
        'bg-surface dark:bg-[transparent] text-ink-primary border-ink-primary dark:border-crimson/70 hover:bg-brand-bg hover:text-ink-primary',
      'outline-success':
        'bg-surface dark:bg-[transparent] text-ink-success border-ink-success hover:bg-status-good-bg hover:text-status-good-fg',
      outline:
        'bg-surface text-fg-primary border-border-strong hover:bg-elevated hover:text-fg-primary',
      ghost:
        'bg-[transparent] text-fg-secondary hover:bg-elevated hover:text-fg-primary',
      success:
        'bg-success-bg text-success-fg hover:bg-success-hover hover:text-success-fg',
      warning:
        'bg-status-warn-bg text-status-warn-fg border-status-warn-fg/40 hover:bg-status-warn-bg hover:text-status-warn-fg',
    },
    size: {
      sm: 'h-9 px-3.5 text-[13px] leading-tight',
      default: 'h-10 px-[16px] text-[14px] leading-tight',
      icon: 'h-9 w-9 shrink-0 p-[0px] text-[14px]',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'default',
  },
});

export type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot
        data-slot="button"
        {...(type !== undefined ? { type } : {})}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
  return (
    <button
      data-slot="button"
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
