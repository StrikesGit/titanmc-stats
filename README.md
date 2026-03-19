# TitanMC Stats Website — Setup Guide

## What's in this folder
```
titanmc-stats/
├── server.js          ← Node.js backend (connects to your MySQL)
├── package.json       ← Dependencies list
├── public/
│   └── index.html     ← The website frontend
└── README.md          ← This file
```

---

## ⚠️ BEFORE YOU START — Change your DB password!
Your database password was shared in chat. Go to BisectHosting panel →
MySQL → reset the password, then update it in server.js.

---

## Step 1 — Install Node.js on your OVH server

SSH into your OVH server, then run:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should show v20.x.x
```

---

## Step 2 — Upload these files to your OVH server

Option A (recommended): Use FileZilla (SFTP)
- Connect to your OVH server IP with your root credentials
- Upload the entire `titanmc-stats` folder to `/var/www/titanmc-stats`

Option B: Create files manually via SSH
```bash
mkdir -p /var/www/titanmc-stats/public
# then paste the file contents manually
```

---

## Step 3 — Install dependencies
```bash
cd /var/www/titanmc-stats
npm install
```

---

## Step 4 — Update the database password in server.js
Open server.js and replace `REPLACE_WITH_YOUR_NEW_PASSWORD` with your new password.

Or better — create a .env file:
```bash
nano /var/www/titanmc-stats/.env
```
Paste:
```
DB_HOST=gamesdal179.bisecthosting.com
DB_PORT=3307
DB_USER=u80623255_d3AcJ05Fmy
DB_PASS=YOUR_NEW_PASSWORD_HERE
DB_NAME=s80623255_titanmc_luckperms
DB_TABLE=titantickets_data
PORT=3000
```

---

## Step 5 — Test it works
```bash
cd /var/www/titanmc-stats
node server.js
```
You should see:
```
✅ Connected to MySQL database!
🚀 TitanMC Stats running at http://localhost:3000
```

Open a browser and go to: http://YOUR_OVH_SERVER_IP:3000

---

## Step 6 — Keep it running 24/7 with PM2
```bash
sudo npm install -g pm2
cd /var/www/titanmc-stats
pm2 start server.js --name titanmc-stats
pm2 startup          # follow the printed command
pm2 save
```

Now the website stays online even if you close SSH!

---

## Step 7 (Optional) — Use a domain name + port 80

If you have a domain pointing to your OVH server:
```bash
sudo apt install nginx -y
sudo nano /etc/nginx/sites-available/titanmc-stats
```

Paste this (replace stats.titanmc.gg with your domain):
```nginx
server {
    listen 80;
    server_name stats.titanmc.gg;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Then:
```bash
sudo ln -s /etc/nginx/sites-available/titanmc-stats /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

Now your site is at http://stats.titanmc.gg (no port needed)

---

## Troubleshooting

**"Failed to connect to database"**
- Check BisectHosting → MySQL → make sure remote access is enabled
- Double-check the password in server.js or .env

**"Player not found"**
- The player must have joined the server at least once so TitanTickets created their record

**Port 3000 not accessible**
- Check your OVH firewall: allow inbound TCP port 3000 (or use Nginx on port 80)
