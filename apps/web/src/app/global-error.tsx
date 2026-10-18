'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="utf-8" />
        <meta name="color-scheme" content="dark" />
        <title>Sự cố hệ thống - Rate.vn</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f1113',
          color: '#f1f5f9',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            width: '100%',
            backgroundColor: '#16191d',
            border: '1px solid #262b33',
            borderRadius: '16px',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              backgroundColor: 'rgba(216, 48, 48, 0.15)',
              color: '#ff6b6b',
              fontWeight: 700,
              fontSize: '0.8125rem',
              padding: '6px 12px',
              borderRadius: '999px',
              marginBottom: '16px',
            }}
          >
            CẢNH BÁO HỆ THỐNG RATE.VN
          </div>
          <h1
            style={{ fontSize: '22px', margin: '0 0 12px', color: '#ffffff' }}
          >
            Đã xảy ra gián đoạn tạm thời khi tải dữ liệu
          </h1>
          <p
            style={{
              fontSize: '14px',
              lineHeight: 1.6,
              color: '#94a3b8',
              margin: '0 0 20px',
            }}
          >
            Hệ thống kiểm toán thông số và giá đang tự động khôi phục kết nối.
            {error?.digest ? ` (Mã tham chiếu: ${error.digest})` : ''}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              backgroundColor: '#d83030',
              color: '#ffffff',
              border: 'none',
              borderRadius: '999px',
              padding: '10px 24px',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            Thử tải lại trang
          </button>
        </div>
      </body>
    </html>
  );
}
