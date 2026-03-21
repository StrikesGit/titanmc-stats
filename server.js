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
    console.log('Connected to MySQL database!');
    conn.release();
  } catch (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

    let tokens = null;
    try {
      const [r] = await pool.execute(
        'SELECT balance FROM `titantokens_data` WHERE uuid = ? LIMIT 1',
        [player.uuid]
      );
      if (r.length > 0) tokens = Math.floor(r[0].balance);
    } catch(e) { console.warn('TitanTokens:', e.message); }

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

    let cellName = null, cellMembers = null, cellOwnedSince = null;
    try {
      const [cellRows] = await pool.execute(
        'SELECT cell_name, members, owned_since FROM `titancellshook_data` WHERE owner_uuid = ?',
        [player.uuid]
      );
      if (cellRows.length > 0) {
        cellName = cellRows.map(r => r.cell_name).join(', ');
        const allMembers = cellRows.map(r => r.members).filter(m => m && m.trim() !== '').join(', ');
        cellMembers = allMembers || '0';
        const oldest = Math.min(...cellRows.map(r => Number(r.owned_since)));
        if (oldest && oldest > 0) {
          const d = new Date(oldest);
          cellOwnedSince = d.toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'});
        }
      }
    } catch(e) { console.warn('TitanCellsHook:', e.message); }

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

    let crateTotal = null, crateVote = null, crateFish = null, crateKoth = null, crateRebirth = null, crateTitan = null;
    try {
      const [crateRows] = await pool.execute(
        'SELECT crateData FROM `excellentcrates_users` WHERE uuid = ? LIMIT 1',
        [player.uuid]
      );
      if (crateRows.length > 0 && crateRows[0].crateData) {
        const cd = JSON.parse(crateRows[0].crateData);
        crateVote    = cd.vote    ? (cd.vote.openings    ?? 0) : 0;
        crateFish    = cd.fish    ? (cd.fish.openings    ?? 0) : 0;
        crateKoth    = cd.koth    ? (cd.koth.openings    ?? 0) : 0;
        crateRebirth = cd.rebirth ? (cd.rebirth.openings ?? 0) : 0;
        crateTitan   = cd.titan   ? (cd.titan.openings   ?? 0) : 0;
        crateTotal   = crateVote + crateFish + crateKoth + crateRebirth + crateTitan;
      }
    } catch(e) { console.warn('ExcellentCrates:', e.message); }

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
      crateTotal, crateVote, crateFish, crateKoth, crateRebirth, crateTitan,
    });

  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ error: 'Database error. Please try again later.' });
  }
});

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
    console.log(`Server running on port ${PORT}`);
  });
});
