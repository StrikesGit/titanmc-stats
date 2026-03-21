const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_CONFIG = {
  host: 'autorack.proxy.rlwy.net',
  port: 15703,
  user: 'root',
  password: 'OgQsuhtYXAoegrFqArBrtNSaBnxVZCYJ',
  database: 'railway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
};

const TABLE = 'titantickets_data';

let pool;

async function initDB() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL database!');
    conn.release();
  } catch (err) {
    console.error('❌ Failed to connect to database:', err.message, err.code, err.errno);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/player/:name
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

    // TitanRanks
    let rank = 'N/A', prestige = 'N/A', rebirth = 'N/A';
    try {
      const [r] = await pool.execute(
        'SELECT `rank`, prestige, rebirth FROM `titanranks_players` WHERE uuid = ? LIMIT 1',
        [player.uuid]
      );
      if (r.length > 0) {
        rank     = r[0].rank     ?? 'N/A';
        prestige = r[0].prestige ?? 'N/A';
        rebirth  = r[0].rebirth  ?? 'N/A';
      }
    } catch(e) { console.warn('TitanRanks:', e.message); }

    // TitanTokens
    let tokens = null;
    try {
      const [r] = await pool.execute(
        'SELECT balance FROM `titantokens_data` WHERE uuid = ? LIMIT 1',
        [player.uuid]
      );
      if (r.length > 0) tokens = Math.floor(r[0].balance);
    } catch(e) { console.warn('TitanTokens:', e.message); }

    // TitanMoney
    let money = null, firstJoin = null, playtime = null, totalJoins = null;
    try {
      const [r] = await pool.execute(
        'SELECT balance, first_join, playtime, total_joins FROM `titanmoney_data` WHERE uuid = ? LIMIT 1',
        [player.uuid]
      );
      if (r.length > 0) {
        money = Math.floor(r[0].balance);
        if (r[0].first_join) {
          const d = new Date(r[0].first_join);
          firstJoin = d.toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'});
        }
        if (r[0].playtime) {
          const ms = r[0].playtime;
          const mins  = Math.floor(ms / 60000);
          const hours = Math.floor(mins / 60);
          const days  = Math.floor(hours / 24);
          if (days > 0)       playtime = days + 'd ' + (hours % 24) + 'h';
          else if (hours > 0) playtime = hours + 'h ' + (mins % 60) + 'm';
          else                playtime = mins + 'm';
        }
        totalJoins = r[0].total_joins ?? null;
      }
    } catch(e) { console.warn('TitanMoney:', e.message); }

    // TitanCellsHook — rank "E3" -> "Cell_E_30"
    let cellName = null, cellMembers = null, cellOwnedSince = null;
    try {
      if (rank !== 'N/A') {
        const match = rank.match(/^([A-Za-z]+)([0-9]+)$/);
        if (match) {
          const cellKey = 'Cell_' + match[1] + '_' + match[2] + '0';
          const [r] = await pool.execute(
            'SELECT cell_name, members, owned_since FROM `titancellshook_data` WHERE cell_name = ? LIMIT 1',
            [cellKey]
          );
          if (r.length > 0) {
            cellName = r[0].cell_name;
            cellMembers = r[0].members || '0';
            if (r[0].owned_since) {
              const d = new Date(Number(r[0].owned_since));
              cellOwnedSince = d.toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'});
            }
          }
        }
      }
    } catch(e) { console.warn('TitanCellsHook:', e.message); }

    // TitanCustomTool
    let totalBlocks = null, rawBlocks = null, fishCaught = null, currentPickaxe = null;
    try {
      const [r] = await pool.execute(
        'SELECT total_blocks, raw_blocks, fish_caught, current_pickaxe FROM `titancustomtool_data` WHERE uuid = ? LIMIT 1',
        [player.uuid]
      );
      if (r.length > 0) {
        totalBlocks = Math.floor(r[0].total_blocks);
        rawBlocks   = Math.floor(r[0].raw_blocks);
        fishCaught  = Math.floor(r[0].fish_caught);
        if (r[0].current_pickaxe) {
          try { currentPickaxe = JSON.parse(r[0].current_pickaxe); } catch(e) {}
        }
      }
    } catch(e) { console.warn('TitanCustomTool:', e.message); }

    res.json({
      uuid: player.uuid,
      name: player.name,
      tickets: Math.floor(player.balance),
      last_updated: player.last_updated,
      rank, prestige, rebirth,
      tokens, money,
      firstJoin, playtime, totalJoins,
      cellName, cellMembers, cellOwnedSince,
      totalBlocks, rawBlocks, fishCaught, currentPickaxe,
    });

  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ error: 'Database error. Please try again later.' });
  }
});

// GET /api/players
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

// GET /api/achievements/:uuid
app.get('/api/achievements/:uuid', async (req, res) => {
  const uuid = req.params.uuid;
  try {
    const [rows] = await pool.execute(
      'SELECT achievement_id, obtained_at FROM `titanachievements_data` WHERE uuid = ? ORDER BY obtained_at ASC',
      [uuid]
    );
    res.json(rows.map(r => ({ id: r.achievement_id, obtained_at: r.obtained_at })));
  } catch (err) {
    console.error('Achievements error:', err.message);
    res.status(500).json({ error: 'Could not fetch achievements.' });
  }
});

// GET /api/leaderboard
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 TitanMC Stats running at http://localhost:${PORT}`);
  });
});
