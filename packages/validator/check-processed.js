const { Pool } = require('pg');

async function checkProcessedData() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'rate_db',
    user: 'JOY',
    password: '***REMOVED-SECRET***'
  });

  try {
    // Check if any data was processed
    const result = await pool.query('SELECT COUNT(*) as total FROM validated_items');
    console.log('📊 Total items in database:', result.rows[0].total);
    
    // Check by type
    const typeResult = await pool.query(`
      SELECT item_type, COUNT(*) as count 
      FROM validated_items 
      GROUP BY item_type
    `);
    
    if (typeResult.rows.length > 0) {
      console.log('\n📦 Items by type:');
      typeResult.rows.forEach(row => {
        console.log('  -', row.item_type + ':', row.count);
      });
    }
    
    // Show recent reviews
    const reviewResult = await pool.query(`
      SELECT 
        request_id,
        username,
        substring(comment, 1, 80) as comment_preview,
        star_rate,
        product_name,
        seller_name,
        status,
        created_at
      FROM validated_items 
      WHERE item_type = 'review'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (reviewResult.rows.length > 0) {
      console.log('\n⭐ Recent reviews processed:');
      reviewResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. ${row.username || 'Anonymous'} - ${row.star_rate} stars`);
        console.log(`   Comment: ${row.comment_preview}...`);
        console.log(`   Product: ${row.product_name || 'N/A'}`);
        console.log(`   Seller: ${row.seller_name || 'N/A'}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Time: ${new Date(row.created_at).toLocaleString()}`);
        console.log();
      });
    } else {
      console.log('\n⚠️ No review data found in database');
      console.log('Worker may not have processed the messages yet');
    }
    
    // Check scam data
    const scamResult = await pool.query(`
      SELECT 
        phone,
        bank_account,
        email,
        status,
        error_message
      FROM validated_items 
      WHERE item_type = 'scam' OR item_type IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (scamResult.rows.length > 0) {
      console.log('\n🚨 Recent scam data processed:');
      scamResult.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. Phone: ${row.phone || 'N/A'} | Bank: ${row.bank_account || 'N/A'}`);
        console.log(`   Email: ${row.email || 'N/A'}`);
        console.log(`   Status: ${row.status}`);
        if (row.error_message) {
          console.log(`   Error: ${row.error_message}`);
        }
        console.log();
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkProcessedData();