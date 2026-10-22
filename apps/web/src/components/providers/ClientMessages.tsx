import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import {
  pickClientMessages,
  type ClientMessageScope,
} from '@/lib/client-messages';

/**
 * Gives the Client Components below it the messages of one route scope on
 * top of the shared ones the layout provides (DOS/Rate#736).
 */
export default async function ClientMessages({
  scope,
  children,
}: {
  scope: ClientMessageScope;
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickClientMessages(messages, scope)}>
      {children}
    </NextIntlClientProvider>
  );
}
