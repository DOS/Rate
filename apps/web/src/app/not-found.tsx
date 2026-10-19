import Link from 'next/link';

// Only reached outside the [locale] segment, which renders its own branded
// page. The root layout has no <html>, so this page brings its own.
export default function RootNotFound() {
  return (
    <html lang="vi">
      <body>
        <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
          <h1>404</h1>
          <p>
            <Link href="/">Rate.vn</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
