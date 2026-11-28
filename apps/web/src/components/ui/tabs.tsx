import * as React from 'react';

import { cn } from '@/lib/utils';

function NavTabs({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot="nav-tabs"
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-[10px] border-[1px] border-solid border-border-subtle bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
      {...props}
    />
  );
}

function NavTabLink({
  className,
  children,
  ...props
}: React.ComponentProps<'a'>) {
  return (
    <a
      data-slot="nav-tab"
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center rounded-[6px] px-3.5 text-[13px] leading-none font-semibold whitespace-nowrap text-fg-primary no-underline transition-colors hover:bg-elevated hover:text-fg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
        className
      )}
      {...props}
    >
      {children}
    </a>
  );
}

export { NavTabs, NavTabLink };
