import Link from 'next/link';
import { compareMasterProducts, getMasterProducts } from '@/lib/rate-api';
import type { ProductSpecifications } from '@repo/shared-data';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ slugs?: string }>;
};

export default async function ComparePhonesPage({
  params,
  searchParams,
}: PageProps) {
  const { locale } = await params;
  const { slugs: slugsParam } = await searchParams;

  let requestedSlugs: string[] = [];
  if (slugsParam) {
    requestedSlugs = slugsParam.split(',').map((s) => s.trim()).filter(Boolean);
  }

  let products = await compareMasterProducts(requestedSlugs);

  // If no specific slugs requested or none found, default to first 3 products
  if (products.length === 0) {
    products = await getMasterProducts({ limit: 3 });
  }

  return (
    <div className="container py-5">
      {/* Header */}
      <div className="mb-4">
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb small mb-2">
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
              So sánh thông số
            </li>
          </ol>
        </nav>
        <h1 className="h2 fw-bold mb-1">So Sánh Điện Thoại Thông Minh</h1>
        <p className="text-muted mb-0">
          Đối chiếu trực quan từng chi tiết thông số kỹ thuật chuẩn và mức giá sàn thị trường
        </p>
      </div>

      {products.length < 2 ? (
        <div className="card border-0 shadow-sm rounded-4 p-5 text-center bg-light">
          <p className="text-muted mb-3">
            Cần ít nhất 2 sản phẩm để thực hiện so sánh.
          </p>
          <Link href={`/${locale}/smartphones`} className="btn btn-primary rounded-pill px-4 mx-auto">
            Xem danh sách điện thoại
          </Link>
        </div>
      ) : (
        <div className="card border-0 shadow-sm rounded-4 p-4 overflow-hidden">
          <div className="table-responsive">
            <table className="table table-bordered align-middle text-center mb-0">
              {/* Product Header Cards */}
              <thead className="table-light">
                <tr>
                  <th style={{ width: '220px' }} className="text-start bg-light align-middle fw-bold">
                    Tiêu chí so sánh
                  </th>
                  {products.map((p) => {
                    const thumb =
                      p.thumbnail || (p.images && p.images.length > 0 ? p.images[0] : null);
                    const minPrice = Number(p.min_price).toLocaleString('vi-VN');

                    return (
                      <th key={p.id} style={{ minWidth: '220px' }} className="p-3">
                        <div className="d-flex flex-column align-items-center">
                          <div
                            className="bg-white rounded-3 p-2 mb-2 d-flex align-items-center justify-content-center"
                            style={{ height: '140px', width: '140px' }}
                          >
                            {thumb ? (
                              <img
                                src={thumb}
                                alt={p.name}
                                style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                              />
                            ) : (
                              <div className="text-muted small">No Image</div>
                            )}
                          </div>
                          <Link
                            href={`/${locale}/smartphones/${p.slug}`}
                            className="fw-bold text-dark text-decoration-none h6 mb-1 text-hover-primary"
                          >
                            {p.name}
                          </Link>
                          <div className="text-danger fw-bold mb-2">{minPrice} ₫</div>
                          <Link
                            href={`/${locale}/smartphones/${p.slug}#offers-table`}
                            className="btn btn-sm btn-outline-danger rounded-pill px-3"
                          >
                            Xem nơi bán ({p.merchant_count})
                          </Link>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {/* 1. Màn hình */}
                <tr className="table-secondary text-start fw-bold">
                  <td colSpan={products.length + 1} className="py-2 px-3">
                    📱 1. Màn hình (Display)
                  </td>
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Kích thước màn hình</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="fw-semibold">{specs?.display?.size_inch ? `${specs.display.size_inch}"` : '—'}</td>;
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Công nghệ hiển thị</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="small">{specs?.display?.type || '—'}</td>;
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Độ phân giải &amp; Tần số quét</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return (
                      <td key={p.id} className="small">
                        {specs?.display?.resolution || '—'}
                        {specs?.display?.refresh_rate_hz ? ` (${specs.display.refresh_rate_hz}Hz)` : ''}
                      </td>
                    );
                  })}
                </tr>

                {/* 2. Hiệu năng & Phần cứng */}
                <tr className="table-secondary text-start fw-bold">
                  <td colSpan={products.length + 1} className="py-2 px-3">
                    ⚡ 2. Hiệu năng &amp; Phần cứng (Hardware)
                  </td>
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Vi xử lý (Chipset)</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="fw-bold text-primary">{specs?.hardware?.chipset || '—'}</td>;
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">RAM / Bộ nhớ</td>
                  {products.map((p) => {
                    return (
                      <td key={p.id} className="fw-semibold">
                        {p.ram_gb ? `${p.ram_gb}GB RAM / ` : ''}
                        {p.storage_gb ? `${p.storage_gb}GB ROM` : '—'}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Hệ điều hành</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="small">{specs?.hardware?.os || '—'}</td>;
                  })}
                </tr>

                {/* 3. Camera */}
                <tr className="table-secondary text-start fw-bold">
                  <td colSpan={products.length + 1} className="py-2 px-3">
                    📸 3. Máy ảnh (Camera)
                  </td>
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Camera chính sau</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="small">{specs?.camera?.main_camera || '—'}</td>;
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Camera trước</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="small">{specs?.camera?.front_camera || '—'}</td>;
                  })}
                </tr>

                {/* 4. Pin & Sạc */}
                <tr className="table-secondary text-start fw-bold">
                  <td colSpan={products.length + 1} className="py-2 px-3">
                    🔋 4. Pin &amp; Sạc (Battery)
                  </td>
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Dung lượng pin</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return (
                      <td key={p.id} className="fw-bold">
                        {specs?.battery?.capacity_mah ? `${specs.battery.capacity_mah} mAh` : '—'}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Công suất sạc nhanh</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return (
                      <td key={p.id} className="small">
                        {specs?.battery?.fast_charging_w ? `${specs.battery.fast_charging_w}W` : '—'}
                      </td>
                    );
                  })}
                </tr>

                {/* 5. Thiết kế & Độ bền */}
                <tr className="table-secondary text-start fw-bold">
                  <td colSpan={products.length + 1} className="py-2 px-3">
                    📐 5. Thiết kế &amp; Độ bền (Design)
                  </td>
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Kích thước &amp; Trọng lượng</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return (
                      <td key={p.id} className="small">
                        {specs?.design?.dimensions || '—'}
                        {specs?.design?.weight_g ? ` | ${specs.design.weight_g}g` : ''}
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Kháng nước &amp; Bụi</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="fw-medium">{specs?.design?.resistance || '—'}</td>;
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Bảo mật sinh trắc học</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="small">{specs?.design?.biometrics || '—'}</td>;
                  })}
                </tr>

                {/* 6. Kết nối */}
                <tr className="table-secondary text-start fw-bold">
                  <td colSpan={products.length + 1} className="py-2 px-3">
                    🌐 6. Kết nối &amp; 5G
                  </td>
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Mạng 5G</td>
                  {products.map((p) => {
                    return <td key={p.id} className="fw-semibold text-success">{p.has_5g ? 'Có 5G' : 'Không'}</td>;
                  })}
                </tr>
                <tr>
                  <td className="text-start text-muted small fw-medium">Cổng kết nối</td>
                  {products.map((p) => {
                    const specs = p.specifications as ProductSpecifications;
                    return <td key={p.id} className="small">{specs?.connectivity?.usb || 'USB-C'}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
