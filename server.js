const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── DATABASE CONFIG ─────────────────────────────────────────────────────────
// IMPORTANT: Move these to environment variables before going public!
// Create a .env file and use dotenv, or set them in your server panel.
const DB_CONFIG = {
  host: process.env.DB_HOST || 'gamesdal179.bisecthosting.com',
  port: process.env.DB_PORT || 3307,
  user: process.env.DB_USER || 'u80623255_d3AcJ05Fmy',
  password: process.env.DB_PASS || 'REPLACE_WITH_YOUR_NEW_PASSWORD', // Change this after resetting!
  database: process.env.DB_NAME || 's80623255_titanmc_luckperms',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 10000,
};

const TABLE = process.env.DB_TABLE || 'titantickets_data';

let pool;

async function initDB() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    // Test connection
    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL database!');
    conn.release();
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message);
    process.exit(1);
  }
}

// ─── MIDDLEWARE ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API ROUTES ──────────────────────────────────────────────────────────────

// GET /api/player/:name — Look up a player by username
app.get('/api/player/:name', async (req, res) => {
  const name = req.params.name.trim();

  if (!name || name.length > 16 || !/^[a-zA-Z0-9_]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid player name.' });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT uuid, name, balance, last_updated FROM \`${TABLE}\` WHERE name = ? LIMIT 1`,
      [name]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Player not found. They may have never joined the server.' });
    }

    const player = rows[0];

    res.json({
      uuid: player.uuid,
      name: player.name,
      tickets: Math.floor(player.balance),
      last_updated: player.last_updated,
    });
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ error: 'Database error. Please try again later.' });
  }
});

// GET /api/players — All players sorted by most recent
app.get('/api/players', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT uuid, name, last_updated FROM \`${TABLE}\` ORDER BY last_updated DESC`
    );
    res.json(rows.map(r => ({ uuid: r.uuid, name: r.name, last_updated: r.last_updated })));
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ error: 'Database error.' });
  }
});

// GET /api/achievements/:uuid — Get achievements for a player
app.get('/api/achievements/:uuid', async (req, res) => {
  const uuid = req.params.uuid;
  try {
    const [rows] = await pool.execute(
      `SELECT achievement_id, obtained_at FROM \`titanachievements_data\` WHERE uuid = ? ORDER BY obtained_at ASC`,
      [uuid]
    );
    res.json(rows.map(r => ({ id: r.achievement_id, obtained_at: r.obtained_at })));
  } catch (err) {
    console.error('Achievements error:', err.message);
    res.status(500).json({ error: 'Could not fetch achievements.' });
  }
});

// GET /api/leaderboard — Top 10 players by ticket balance
app.get('/api/leaderboard', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT uuid, name, balance FROM \`${TABLE}\` ORDER BY balance DESC LIMIT 10`
    );

    res.json(rows.map((r, i) => ({
      rank: i + 1,
      uuid: r.uuid,
      name: r.name,
      tickets: Math.floor(r.balance),
    })));
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ error: 'Database error. Please try again later.' });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── START ───────────────────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 TitanMC Stats running at http://localhost:${PORT}`);
  });
});
