import 'bootstrap/dist/css/bootstrap.css';
import './style/scss/style.scss';

// <html> and <body> are rendered by app/[locale]/layout.tsx, which knows the
// locale from its URL segment. Resolving it here with getLocale() reads the
// request headers and made every page render per request (DOS/Rate#491).
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
