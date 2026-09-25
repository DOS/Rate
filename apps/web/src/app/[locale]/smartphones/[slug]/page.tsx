import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMasterProductBySlug,
  getMasterProductOffers,
  getMasterProductReviews,
} from '@/lib/rate-api';
import type { ProductSpecifications } from '@repo/shared-data';

type PageParams = Promise<{ locale: string; slug: string }>;

export default async function SmartphoneDetailPage({
  params,
}: {
  params: PageParams;
}) {
  const { locale, slug } = await params;
  const product = await getMasterProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const [offers, reviews] = await Promise.all([
    getMasterProductOffers(product.id),
    getMasterProductReviews(product.id),
  ]);

  const specs = product.specifications as ProductSpecifications;
  const keySpecs = product.key_specs as any;
  const minPriceFormatted = Number(product.min_price).toLocaleString('vi-VN');
  const maxPriceFormatted = Number(product.max_price).toLocaleString('vi-VN');

  return (
    <div className="container py-5">
      {/* Breadcrumb */}
      <nav aria-label="breadcrumb" className="mb-4">
        <ol className="breadcrumb small">
          <li className="breadcrumb-item">
            <Link href={`/${locale}`} className="text-decoration-none">
              Trang chủ
            </Link>
          </li>
          <li className="breadcrumb-item">
            <Link href={`/${locale}/smartphones`} className="text-decoration-none">
              Điện thoại
            </Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            {product.name}
          </li>
        </ol>
      </nav>

      {/* Main Info Section */}
      <div className="row g-4 mb-5">
        {/* Left: Images */}
        <div className="col-12 col-lg-5">
          <div className="card border-0 shadow-sm rounded-4 p-4 text-center bg-light">
            <div
              className="d-flex align-items-center justify-content-center"
              style={{ minHeight: '380px' }}
            >
              {product.images && product.images.length > 0 ? (
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="img-fluid rounded-3"
                  style={{ maxHeight: '350px', objectFit: 'contain' }}
                />
              ) : (
                <div className="text-muted">Chưa có ảnh sản phẩm</div>
              )}
            </div>

            {/* Colors */}
            {product.colors && product.colors.length > 0 && (
              <div className="mt-3 pt-3 border-top text-start">
                <div className="small text-muted mb-2">Màu sắc có sẵn:</div>
                <div className="d-flex flex-wrap gap-2">
                  {product.colors.map((c, i) => (
                    <span key={i} className="badge bg-white text-dark border px-3 py-2 rounded-pill small">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Overview & Offers Highlights */}
        <div className="col-12 col-lg-7 d-flex flex-column">
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="badge bg-primary-subtle text-primary fw-semibold px-3 py-1 rounded-pill">
              {product.brand}
            </span>
            {product.has_5g && (
              <span className="badge bg-dark px-2 py-1 rounded-pill">5G</span>
            )}
            {product.variant_name && (
              <span className="badge bg-light text-muted border px-2 py-1 rounded-pill">
                {product.variant_name}
              </span>
            )}
          </div>

          <h1 className="h2 fw-bold text-dark mb-3">{product.name}</h1>

          {/* Quick specs grid */}
          <div className="row g-2 mb-4">
            <div className="col-6 col-sm-4">
              <div className="p-3 bg-light rounded-3">
                <div className="text-muted small">Màn hình</div>
                <div className="fw-semibold">{keySpecs?.screen || 'OLED'}</div>
              </div>
            </div>
            <div className="col-6 col-sm-4">
              <div className="p-3 bg-light rounded-3">
                <div className="text-muted small">Vi xử lý</div>
                <div className="fw-semibold">{keySpecs?.chip || 'Apple A-Series'}</div>
              </div>
            </div>
            <div className="col-6 col-sm-4">
              <div className="p-3 bg-light rounded-3">
                <div className="text-muted small">Camera chính</div>
                <div className="fw-semibold">{keySpecs?.camera || '48 MP'}</div>
              </div>
            </div>
            <div className="col-6 col-sm-4">
              <div className="p-3 bg-light rounded-3">
                <div className="text-muted small">Bộ nhớ (RAM/ROM)</div>
                <div className="fw-semibold">
                  {product.ram_gb ? `${product.ram_gb}GB / ` : ''}
                  {product.storage_gb ? `${product.storage_gb}GB` : ''}
                </div>
              </div>
            </div>
            <div className="col-6 col-sm-4">
              <div className="p-3 bg-light rounded-3">
                <div className="text-muted small">Pin & Sạc</div>
                <div className="fw-semibold">{keySpecs?.battery || '3500 mAh'}</div>
              </div>
            </div>
            <div className="col-6 col-sm-4">
              <div className="p-3 bg-light rounded-3">
                <div className="text-muted small">Kháng nước/bụi</div>
                <div className="fw-semibold">{specs?.design?.resistance?.split(' ')[0] || 'IP68'}</div>
              </div>
            </div>
          </div>

          {/* Price Range Box */}
          <div className="card bg-danger-subtle border-0 rounded-4 p-4 mb-4">
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3">
              <div>
                <div className="text-danger-emphasis small fw-medium">Giá bán tốt nhất thị trường:</div>
                <div className="h3 fw-bold text-danger mb-0">
                  {minPriceFormatted} ₫
                  {product.min_price !== product.max_price && (
                    <span className="fs-6 fw-normal text-muted ms-2">
                      ~ {maxPriceFormatted} ₫
                    </span>
                  )}
                </div>
              </div>
              <div className="d-flex gap-2">
                <a href="#offers-table" className="btn btn-danger px-4 rounded-pill fw-medium">
                  Xem {offers.length} nơi bán
                </a>
                <Link
                  href={`/${locale}/compare?slugs=${product.slug}`}
                  className="btn btn-outline-dark px-3 rounded-pill"
                >
                  So sánh máy này
                </Link>
              </div>
            </div>
          </div>

          <p className="text-muted small lh-base">
            Mã định danh dữ liệu chuẩn (Canonical Model Key): <code>{product.model_key}</code>
          </p>
        </div>
      </div>

      {/* 10 Field Groups Specifications */}
      <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5 mb-5">
        <h2 className="h4 fw-bold mb-4 d-flex align-items-center gap-2">
          <span>📋</span> Bảng Thông Số Kỹ Thuật Chi Tiết (10 Nhóm Chuẩn Hóa)
        </h2>

        <div className="row g-4">
          {/* 1. Màn hình */}
          <div className="col-12 col-md-6">
            <div className="border rounded-4 p-4 h-100 bg-white">
              <h3 className="h6 fw-bold text-primary mb-3">1. Màn hình (Display)</h3>
              <dl className="row mb-0 small">
                <dt className="col-5 text-muted">Kích thước</dt>
                <dd className="col-7 fw-medium">{specs?.display?.size_inch ? `${specs.display.size_inch} inch` : '—'}</dd>
                <dt className="col-5 text-muted">Công nghệ</dt>
                <dd className="col-7 fw-medium">{specs?.display?.type || '—'}</dd>
                <dt className="col-5 text-muted">Độ phân giải</dt>
                <dd className="col-7 fw-medium">{specs?.display?.resolution || '—'}</dd>
                <dt className="col-5 text-muted">Tần số quét</dt>
                <dd className="col-7 fw-medium">{specs?.display?.refresh_rate_hz ? `${specs.display.refresh_rate_hz} Hz` : '—'}</dd>
                <dt className="col-5 text-muted">Mật độ điểm ảnh</dt>
                <dd className="col-7 fw-medium">{specs?.display?.ppi ? `${specs.display.ppi} ppi` : '—'}</dd>
                <dt className="col-5 text-muted">Kính bảo vệ</dt>
                <dd className="col-7 fw-medium">{specs?.display?.protection || '—'}</dd>
                <dt className="col-5 text-muted">Tính năng</dt>
                <dd className="col-7 fw-medium">{specs?.display?.features || '—'}</dd>
              </dl>
            </div>
          </div>

          {/* 2. Phần cứng */}
          <div className="col-12 col-md-6">
            <div className="border rounded-4 p-4 h-100 bg-white">
              <h3 className="h6 fw-bold text-primary mb-3">2. Phần cứng &amp; Hiệu năng (Hardware)</h3>
              <dl className="row mb-0 small">
                <dt className="col-5 text-muted">Chipset</dt>
                <dd className="col-7 fw-medium">{specs?.hardware?.chipset || '—'}</dd>
                <dt className="col-5 text-muted">CPU</dt>
                <dd className="col-7 fw-medium">{specs?.hardware?.cpu || '—'}</dd>
                <dt className="col-5 text-muted">GPU</dt>
                <dd className="col-7 fw-medium">{specs?.hardware?.gpu || '—'}</dd>
                <dt className="col-5 text-muted">RAM</dt>
                <dd className="col-7 fw-medium">{specs?.hardware?.ram_gb ? `${specs.hardware.ram_gb} GB` : '—'}</dd>
                <dt className="col-5 text-muted">Bộ nhớ trong</dt>
                <dd className="col-7 fw-medium">{specs?.hardware?.storage_gb ? `${specs.hardware.storage_gb} GB` : '—'}</dd>
                <dt className="col-5 text-muted">Thẻ nhớ ngoài</dt>
                <dd className="col-7 fw-medium">{specs?.hardware?.storage_expansion || '—'}</dd>
                <dt className="col-5 text-muted">Hệ điều hành</dt>
                <dd className="col-7 fw-medium">{specs?.hardware?.os || '—'}</dd>
              </dl>
            </div>
          </div>

          {/* 3. Camera */}
          <div className="col-12 col-md-6">
            <div className="border rounded-4 p-4 h-100 bg-white">
              <h3 className="h6 fw-bold text-primary mb-3">3. Máy ảnh (Camera)</h3>
              <dl className="row mb-0 small">
                <dt className="col-5 text-muted">Cụm sau</dt>
                <dd className="col-7 fw-medium">{specs?.camera?.rear_setup || '—'}</dd>
                <dt className="col-5 text-muted">Camera chính</dt>
                <dd className="col-7 fw-medium">{specs?.camera?.main_camera || '—'}</dd>
                <dt className="col-5 text-muted">Camera trước</dt>
                <dd className="col-7 fw-medium">{specs?.camera?.front_camera || '—'}</dd>
                <dt className="col-5 text-muted">Đèn Flash</dt>
                <dd className="col-7 fw-medium">{specs?.camera?.flash || '—'}</dd>
                <dt className="col-5 text-muted">Quay video</dt>
                <dd className="col-7 fw-medium">{specs?.camera?.video_recording || '—'}</dd>
              </dl>
            </div>
          </div>

          {/* 4. Pin & Sạc */}
          <div className="col-12 col-md-6">
            <div className="border rounded-4 p-4 h-100 bg-white">
              <h3 className="h6 fw-bold text-primary mb-3">4. Pin &amp; Sạc (Battery)</h3>
              <dl className="row mb-0 small">
                <dt className="col-5 text-muted">Dung lượng pin</dt>
                <dd className="col-7 fw-medium">{specs?.battery?.capacity_mah ? `${specs.battery.capacity_mah} mAh` : '—'}</dd>
                <dt className="col-5 text-muted">Loại pin</dt>
                <dd className="col-7 fw-medium">{specs?.battery?.type || '—'}</dd>
                <dt className="col-5 text-muted">Công nghệ sạc</dt>
                <dd className="col-7 fw-medium">{specs?.battery?.charging || '—'}</dd>
                <dt className="col-5 text-muted">Công suất sạc nhanh</dt>
                <dd className="col-7 fw-medium">{specs?.battery?.fast_charging_w ? `${specs.battery.fast_charging_w} W` : '—'}</dd>
              </dl>
            </div>
          </div>

          {/* 5. Thiết kế */}
          <div className="col-12 col-md-6">
            <div className="border rounded-4 p-4 h-100 bg-white">
              <h3 className="h6 fw-bold text-primary mb-3">5. Thiết kế &amp; Độ bền (Design)</h3>
              <dl className="row mb-0 small">
                <dt className="col-5 text-muted">Kích thước</dt>
                <dd className="col-7 fw-medium">{specs?.design?.dimensions || '—'}</dd>
                <dt className="col-5 text-muted">Trọng lượng</dt>
                <dd className="col-7 fw-medium">{specs?.design?.weight_g ? `${specs.design.weight_g} g` : '—'}</dd>
                <dt className="col-5 text-muted">Chất liệu</dt>
                <dd className="col-7 fw-medium">{specs?.design?.materials || '—'}</dd>
                <dt className="col-5 text-muted">Kháng nước, bụi</dt>
                <dd className="col-7 fw-medium">{specs?.design?.resistance || '—'}</dd>
                <dt className="col-5 text-muted">Bảo mật</dt>
                <dd className="col-7 fw-medium">{specs?.design?.biometrics || '—'}</dd>
                <dt className="col-5 text-muted">Phím chức năng</dt>
                <dd className="col-7 fw-medium">{specs?.design?.keys || '—'}</dd>
              </dl>
            </div>
          </div>

          {/* 6. Kết nối & Mạng */}
          <div className="col-12 col-md-6">
            <div className="border rounded-4 p-4 h-100 bg-white">
              <h3 className="h6 fw-bold text-primary mb-3">6. Kết nối &amp; 5G (Cellular &amp; Connectivity)</h3>
              <dl className="row mb-0 small">
                <dt className="col-5 text-muted">Hỗ trợ 5G</dt>
                <dd className="col-7 fw-medium">{specs?.cellular?.has_5g ? 'Có (Sub-6 / mmWave)' : 'Không'}</dd>
                <dt className="col-5 text-muted">SIM</dt>
                <dd className="col-7 fw-medium">{specs?.cellular?.sim_type || '—'}</dd>
                <dt className="col-5 text-muted">Wi-Fi</dt>
                <dd className="col-7 fw-medium">{specs?.connectivity?.wlan || '—'}</dd>
                <dt className="col-5 text-muted">Bluetooth</dt>
                <dd className="col-7 fw-medium">{specs?.connectivity?.bluetooth || '—'}</dd>
                <dt className="col-5 text-muted">Cổng kết nối</dt>
                <dd className="col-7 fw-medium">{specs?.connectivity?.usb || '—'}</dd>
                <dt className="col-5 text-muted">NFC</dt>
                <dd className="col-7 fw-medium">{specs?.connectivity?.nfc ? 'Có' : 'Không'}</dd>
              </dl>
            </div>
          </div>

          {/* 7. Đa phương tiện & Quy chuẩn */}
          <div className="col-12">
            <div className="border rounded-4 p-4 bg-white">
              <h3 className="h6 fw-bold text-primary mb-3">7. Âm thanh, Pháp lý &amp; Phát hành (Misc &amp; Regulatory)</h3>
              <div className="row g-3 small">
                <div className="col-12 col-md-6">
                  <div className="text-muted">Âm thanh:</div>
                  <div className="fw-medium">{specs?.multimedia?.loudspeaker} | {specs?.multimedia?.audio_features}</div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="text-muted">Ngày phát hành &amp; Chứng nhận:</div>
                  <div className="fw-medium">{specs?.availability?.announced} | {specs?.regulatory?.certifications}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Offers Table */}
      <div id="offers-table" className="card border-0 shadow-sm rounded-4 p-4 p-md-5 mb-5">
        <h2 className="h4 fw-bold mb-4 d-flex align-items-center gap-2">
          <span>🛒</span> So Sánh Nơi Bán &amp; Giá Thực Tế ({offers.length} sàn)
        </h2>

        {offers.length === 0 ? (
          <p className="text-muted mb-0">Hiện chưa có sàn bán nào liên kết với mẫu máy này.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light small">
                <tr>
                  <th scope="col" style={{ width: '25%' }}>Sàn &amp; Gian Hàng</th>
                  <th scope="col">Tiêu đề niêm yết</th>
                  <th scope="col">Độ tin cậy</th>
                  <th scope="col">Giá bán</th>
                  <th scope="col" className="text-end">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => {
                  const price = offer.price_current.toLocaleString('vi-VN');
                  const origPrice = offer.price_original
                    ? offer.price_original.toLocaleString('vi-VN')
                    : null;

                  return (
                    <tr key={offer.id}>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <span className="badge bg-danger text-uppercase small">
                            {offer.platform}
                          </span>
                          <div>
                            <div className="fw-semibold small">{offer.merchant.name}</div>
                            {offer.merchant.is_official && (
                              <span className="badge bg-success-subtle text-success small">
                                Chính hãng (Mall)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="small text-truncate" style={{ maxWidth: '300px' }}>
                        {offer.title}
                      </td>
                      <td>
                        <span className="badge bg-info-subtle text-info small">
                          Trust: {100 - (offer.merchant.risk_score || 0)}%
                        </span>
                      </td>
                      <td>
                        <div className="fw-bold text-danger">{price} ₫</div>
                        {origPrice && (
                          <div className="text-muted small text-decoration-line-through">
                            {origPrice} ₫
                          </div>
                        )}
                      </td>
                      <td className="text-end">
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-primary rounded-pill px-3"
                        >
                          Tới nơi bán ↗
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verified Reviews */}
      <div className="card border-0 shadow-sm rounded-4 p-4 p-md-5">
        <h2 className="h4 fw-bold mb-4 d-flex align-items-center gap-2">
          <span>⭐</span> Đánh Giá Từ Người Mua Thực Tế ({reviews.length} đánh giá)
        </h2>

        {reviews.length === 0 ? (
          <p className="text-muted mb-0">Chưa có đánh giá nào cho sản phẩm này.</p>
        ) : (
          <div className="row g-3">
            {reviews.map((rev) => (
              <div key={rev.id} className="col-12 col-md-6">
                <div className="card bg-light border-0 rounded-4 p-3 h-100">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-semibold small text-dark">{rev.author_name}</span>
                    <span className="badge bg-warning text-dark small">
                      {'★'.repeat(rev.rating_star)}
                    </span>
                  </div>
                  {rev.variation && (
                    <div className="text-muted small mb-2">Phân loại: {rev.variation}</div>
                  )}
                  <p className="small text-secondary mb-0 lh-sm" style={{ whiteSpace: 'pre-line' }}>
                    {rev.comment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
