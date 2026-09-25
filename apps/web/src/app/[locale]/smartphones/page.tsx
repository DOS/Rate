import Link from 'next/link';
import { getMasterProducts } from '@/lib/rate-api';

type PageParams = Promise<{ locale: string }>;

export default async function SmartphonesCatalogPage({
  params,
}: {
  params: PageParams;
}) {
  const { locale } = await params;
  const products = await getMasterProducts();

  return (
    <div className="container py-5">
      {/* Hero Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <div>
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb mb-2 small">
              <li className="breadcrumb-item">
                <Link href={`/${locale}`} className="text-decoration-none">
                  Trang chủ
                </Link>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                Điện thoại thông minh
              </li>
            </ol>
          </nav>
          <h1 className="h2 fw-bold mb-1">Điện Thoại Thông Minh</h1>
          <p className="text-muted mb-0">
            Dữ liệu kỹ thuật 10 nhóm thông số chuẩn xác &amp; so sánh giá sàn thương mại điện tử
          </p>
        </div>

        {products.length >= 2 && (
          <Link
            href={`/${locale}/compare?slugs=${products.map((p) => p.slug).slice(0, 3).join(',')}`}
            className="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
          >
            <span>⚡ So sánh nhanh {products.length >= 3 ? '3 máy' : '2 máy'}</span>
          </Link>
        )}
      </div>

      {/* Product Grid */}
      {products.length === 0 ? (
        <div className="text-center py-5 bg-light rounded-4">
          <p className="text-muted mb-0">Đang cập nhật sản phẩm từ hệ thống...</p>
        </div>
      ) : (
        <div className="row g-4">
          {products.map((item) => {
            const minPriceFormatted = Number(item.min_price).toLocaleString('vi-VN');
            const keySpecs = item.key_specs as any;
            const thumb =
              item.thumbnail ||
              (item.images && item.images.length > 0 ? item.images[0] : null);

            return (
              <div key={item.id} className="col-12 col-md-6 col-lg-4">
                <div className="card h-100 border-0 shadow-sm rounded-4 overflow-hidden d-flex flex-column transition-all hover-shadow">
                  {/* Image container */}
                  <div
                    className="position-relative bg-light d-flex align-items-center justify-content-center p-4"
                    style={{ height: '240px' }}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={item.name}
                        className="img-fluid"
                        style={{ maxHeight: '100%', objectFit: 'contain' }}
                      />
                    ) : (
                      <div className="text-muted">Chưa có ảnh</div>
                    )}

                    {item.has_5g && (
                      <span className="badge bg-dark position-absolute top-0 start-0 m-3 px-2 py-1 rounded-pill small">
                        5G
                      </span>
                    )}

                    <span className="badge bg-success position-absolute top-0 end-0 m-3 px-2 py-1 rounded-pill small">
                      {item.merchant_count} nơi bán
                    </span>
                  </div>

                  {/* Body */}
                  <div className="card-body p-4 d-flex flex-column flex-grow-1">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <span className="badge bg-secondary-subtle text-secondary small fw-medium">
                        {item.brand}
                      </span>
                      {item.variant_name && (
                        <span className="badge bg-light text-muted border small">
                          {item.variant_name}
                        </span>
                      )}
                    </div>

                    <h2 className="h5 fw-bold mb-2">
                      <Link
                        href={`/${locale}/smartphones/${item.slug}`}
                        className="text-decoration-none text-dark stretched-link"
                      >
                        {item.name}
                      </Link>
                    </h2>

                    {/* Key Specs Pills */}
                    <div className="d-flex flex-wrap gap-1 mb-3">
                      {keySpecs?.chip && (
                        <span className="badge bg-light text-dark border small fw-normal">
                          ⚡ {keySpecs.chip}
                        </span>
                      )}
                      {keySpecs?.screen && (
                        <span className="badge bg-light text-dark border small fw-normal">
                          📱 {keySpecs.screen}
                        </span>
                      )}
                      {keySpecs?.battery && (
                        <span className="badge bg-light text-dark border small fw-normal">
                          🔋 {keySpecs.battery}
                        </span>
                      )}
                    </div>

                    {/* Price & Action */}
                    <div className="mt-auto pt-3 border-top d-flex align-items-baseline justify-content-between">
                      <div>
                        <div className="text-muted small">Giá rẻ nhất từ:</div>
                        <div className="text-danger fw-bold fs-5">
                          {minPriceFormatted} ₫
                        </div>
                      </div>
                      <span className="btn btn-sm btn-outline-primary rounded-pill px-3">
                        Chi tiết
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
