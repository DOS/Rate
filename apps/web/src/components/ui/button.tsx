import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// DESIGN.md Principle #5: every button uses var(--rate-radius-btn) (8px),
// never 999px / rounded-full. Border width uses border-[1px] border-solid
// (not Bootstrap's !important .border utility) so semantic border colors win
// in both light and dark themes.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--rate-radius-btn)] border-[1px] border-solid font-semibold normal-case no-underline transition-colors cursor-pointer select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
  {
    variants: {
      variant: {
        primary:
          'bg-brand text-[#ffffff] border-transparent hover:bg-brand-hover hover:text-[#ffffff]',
        'outline-primary':
          'bg-surface dark:bg-transparent text-ink-primary border-ink-primary dark:border-crimson/70 hover:bg-brand-bg hover:text-ink-primary',
        outline:
          'bg-surface text-fg-primary border-border-strong hover:bg-elevated hover:text-fg-primary',
        ghost:
          'bg-[transparent] text-fg-secondary border-transparent hover:bg-elevated hover:text-fg-primary',
        success:
          'bg-[#146c43] text-[#ffffff] border-transparent hover:bg-[#115c39] hover:text-[#ffffff]',
      },
      size: {
        sm: 'h-9 px-3.5 text-[13px] leading-tight',
        default: 'h-10 px-[16px] text-[14px] leading-tight',
        icon: 'h-9 w-9 p-[0px] text-[14px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
);

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
