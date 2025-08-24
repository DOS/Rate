// local-server.js - Node.js server để nhận data từ extension
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, 'images'), { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, 'json'), { recursive: true });
  } catch (error) {
    console.error('Error creating directories:', error);
  }
}

// Save crawled data
app.post('/api/save-data', async (req, res) => {
  try {
    const { data, timestamp } = req.body;
    const filename = `checkscam-${timestamp}.json`;
    const filepath = path.join(DATA_DIR, 'json', filename);
    
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    
    console.log(`✅ Saved ${data.length} records to ${filename}`);
    res.json({ success: true, filename });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save image
app.post('/api/save-image', async (req, res) => {
  try {
    const { url, filename } = req.body;
    
    // Download image
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const filepath = path.join(DATA_DIR, 'images', filename);
    
    await fs.writeFile(filepath, Buffer.from(buffer));
    
    console.log(`✅ Saved image: ${filename}`);
    res.json({ success: true, filename });
  } catch (error) {
    console.error('Error saving image:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3333;
app.listen(PORT, async () => {
  await ensureDataDir();
  console.log(`🚀 Local server running on http://localhost:${PORT}`);
  console.log(`📁 Data will be saved to: ${DATA_DIR}`);
});
