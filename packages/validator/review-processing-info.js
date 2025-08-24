const { Pool } = require('pg');

async function showReviewProcessing() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'rate_db',
    user: 'JOY',
    password: '***REMOVED-SECRET***'
  });

  try {
    console.log('\n📋 CÁCH WORKER XỬ LÝ REVIEW DATA TỪ EXTENSION');
    console.log('='.repeat(60));
    
    // 1. Show sample review data
    const reviewSample = await pool.query(`
      SELECT 
        item_type,
        username,
        comment,
        star_rate,
        product_name,
        product_id,
        seller_name,
        price,
        images_count,
        videos_count,
        url,
        status,
        created_at
      FROM validated_items 
      WHERE item_type = 'review' 
      AND username IS NOT NULL
      LIMIT 3
    `);
    
    console.log('\n1️⃣  DATA REVIEW ĐƯỢC LƯU VÀO DATABASE:');
    console.log('-'.repeat(50));
    
    if (reviewSample.rows.length > 0) {
      reviewSample.rows.forEach((row, idx) => {
        console.log(`\n📝 Review #${idx + 1}:`);
        console.log('  👤 Username:', row.username);
        console.log('  ⭐ Rating:', row.star_rate, 'stars');
        console.log('  💬 Comment:', row.comment ? row.comment.substring(0, 80) + '...' : '[Không có comment - chỉ đánh giá sao]');
        console.log('  📦 Product:', row.product_name || 'N/A');
        console.log('  🆔 Product ID:', row.product_id || 'N/A');
        console.log('  🏪 Seller:', row.seller_name || 'N/A');
        console.log('  💰 Price:', row.price ? parseInt(row.price).toLocaleString() + ' VND' : 'N/A');
        console.log('  📷 Số ảnh:', row.images_count || 0);
        console.log('  🎥 Số video:', row.videos_count || 0);
        console.log('  🔗 URL:', row.url || 'N/A');
        console.log('  ✅ Status:', row.status);
        console.log('  📅 Thời gian:', new Date(row.created_at).toLocaleString());
      });
    }
    
    // 2. Statistics
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN comment IS NOT NULL THEN 1 END) as with_comment,
        COUNT(CASE WHEN comment IS NULL THEN 1 END) as no_comment,
        AVG(star_rate) as avg_rating,
        COUNT(DISTINCT product_id) as unique_products,
        COUNT(DISTINCT seller_name) as unique_sellers
      FROM validated_items 
      WHERE item_type = 'review'
    `);
    
    const stat = stats.rows[0];
    console.log('\n2️⃣  THỐNG KÊ REVIEW ĐÃ XỬ LÝ:');
    console.log('-'.repeat(50));
    console.log('  📊 Tổng số reviews:', stat.total);
    console.log('  💬 Có comment:', stat.with_comment, '(' + Math.round(stat.with_comment/stat.total*100) + '%)');
    console.log('  🔇 Chỉ rating (không comment):', stat.no_comment, '(' + Math.round(stat.no_comment/stat.total*100) + '%)');
    console.log('  ⭐ Rating trung bình:', parseFloat(stat.avg_rating || 0).toFixed(1));
    console.log('  📦 Số sản phẩm khác nhau:', stat.unique_products);
    console.log('  🏪 Số seller khác nhau:', stat.unique_sellers);
    
    // 3. Rating distribution
    const ratings = await pool.query(`
      SELECT 
        star_rate,
        COUNT(*) as count
      FROM validated_items 
      WHERE item_type = 'review' AND star_rate IS NOT NULL
      GROUP BY star_rate
      ORDER BY star_rate DESC
    `);
    
    if (ratings.rows.length > 0) {
      console.log('\n3️⃣  PHÂN BỐ ĐÁNH GIÁ SAO:');
      console.log('-'.repeat(50));
      ratings.rows.forEach(row => {
        const stars = '⭐'.repeat(row.star_rate || 0);
        const percent = Math.round(row.count / stat.total * 100);
        const bar = '█'.repeat(Math.round(percent / 2));
        console.log(`  ${row.star_rate} sao ${stars}: ${bar} (${row.count} reviews - ${percent}%)`);
      });
    }
    
    console.log('\n4️⃣  QUY TRÌNH XỬ LÝ REVIEW:');
    console.log('-'.repeat(50));
    console.log('  1. Extension crawl review từ Shopee/Lazada');
    console.log('  2. Gửi qua Strapi API');
    console.log('  3. Strapi đẩy vào Redis Stream');
    console.log('  4. Worker nhận và validate:');
    console.log('     ✅ Username: Lưu nguyên (có thể masked)');
    console.log('     ✅ Comment: Optional (có thể null)');
    console.log('     ✅ Star rating: Bắt buộc (1-5 sao)');
    console.log('     ✅ Product info: Tên, ID, giá, seller');
    console.log('     ✅ Media: Đếm số lượng ảnh/video');
    console.log('  5. Lưu vào PostgreSQL');
    console.log('  6. Gửi response về extension');
    
    console.log('\n5️⃣  VALIDATION RULES CHO REVIEW:');
    console.log('-'.repeat(50));
    console.log('  ⚠️  Username: Không validate nếu masked (h****)');
    console.log('  ⚠️  Comment: Không bắt buộc, min 5 ký tự nếu có');
    console.log('  ⚠️  Star rating: Phải từ 1-5');
    console.log('  ⚠️  Product name: Nên có nhưng không bắt buộc');
    
    console.log('\n6️⃣  SỬ DỤNG DATA REVIEW:');
    console.log('-'.repeat(50));
    console.log('  🎯 Phân tích sentiment (tích cực/tiêu cực)');
    console.log('  🎯 Phát hiện review fake/spam');
    console.log('  🎯 Thống kê rating theo sản phẩm/seller');
    console.log('  🎯 So sánh giá theo thời gian');
    console.log('  🎯 Xây dựng trust score cho seller');
    console.log('  🎯 Cảnh báo sản phẩm có nhiều review xấu');
    
    // Show raw data structure
    const rawSample = await pool.query(`
      SELECT raw_data::text
      FROM validated_items 
      WHERE item_type = 'review' 
      LIMIT 1
    `);
    
    if (rawSample.rows.length > 0) {
      const raw = JSON.parse(rawSample.rows[0].raw_data);
      console.log('\n7️⃣  CẤU TRÚC RAW DATA TỪ EXTENSION:');
      console.log('-'.repeat(50));
      console.log('  type:', raw.type);
      console.log('  source:', raw.source);
      console.log('  review.username:', raw.review?.username || 'N/A');
      console.log('  review.comment:', raw.review?.comment ? 'Có' : 'Không');
      console.log('  review.starRate:', raw.review?.starRate);
      console.log('  review.product.productName:', raw.review?.product?.productName || 'N/A');
      console.log('  review.product.price:', raw.review?.product?.price || 'N/A');
      console.log('  review.images:', Array.isArray(raw.review?.images) ? raw.review.images.length + ' ảnh' : '0 ảnh');
      console.log('  review.videos:', Array.isArray(raw.review?.videos) ? raw.review.videos.length + ' video' : '0 video');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Worker đang xử lý review data thành công!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

showReviewProcessing();