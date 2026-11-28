import * as React from 'react';

import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-[14px] border-[1px] border-solid border-border-subtle bg-surface text-fg-primary',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col gap-1.5 p-[16px]', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('p-[16px]', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center p-[16px] pt-0', className)}
      {...props}
    />
  );
}

function PriceStrip({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <Card
      className={cn('mb-2 flex flex-col gap-[12px] p-[16px]', className)}
      {...props}
    />
  );
}

function PriceStripHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

function PriceStripLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('text-[13px] font-medium text-fg-secondary', className)}
      {...props}
    />
  );
}

function PriceStripRow({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

function PriceStripValue({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'rate-tabular text-[1.25rem] leading-tight font-bold text-fg-primary',
        className
      )}
      {...props}
    />
  );
}

function PriceStripRange({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'rate-tabular text-[13px] font-normal text-fg-secondary',
        className
      )}
      {...props}
    />
  );
}

function PriceStripActions({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2', className)}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  PriceStrip,
  PriceStripHeader,
  PriceStripLabel,
  PriceStripRow,
  PriceStripValue,
  PriceStripRange,
  PriceStripActions,
};
