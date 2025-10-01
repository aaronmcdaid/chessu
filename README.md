# ChessU - Chess Puzzle Cashu Faucet

Solve chess puzzles, earn Cashu ecash!

## Overview

ChessU is a web application where users solve chess puzzles and receive Cashu tokens (ecash) as rewards. Users can solve 1 puzzle every 30 seconds and earn 10 sats per successful solution.

## Features

- 201 easy chess puzzles (rating 800-1400)
- Cashu token rewards (Bitcoin ecash)
- Lightning Network donations to puzzle pot
- Rate limiting (30 seconds between solves)
- Clean UI with interactive chessboard

## Tech Stack

- **Backend:** Node.js + Express
- **Wallet:** coco-cashu (Cashu protocol)
- **Database:** SQLite
- **Frontend:** Vanilla JS + chessboard.js + chess.js
- **Deployment:** Docker

## Configuration

Key settings in `server/server.js`:

```javascript
const config = {
  testMint: 'https://nofees.testnut.cashu.space',
  mainMint: 'https://mint.minibits.cash/Bitcoin',
  activeMode: process.env.ACTIVE_MODE || 'test',
  puzzleReward: 10, // sats per puzzle
  rateLimitSeconds: 30, // seconds between solves
};
```

## Environment Variables

Create a `.env` file:

```bash
ACTIVE_MODE=main
WALLET_SEED=your-secure-random-seed-here
```

Generate a secure seed:
```bash
openssl rand -hex 32
```

## Running Locally

```bash
docker-compose up -d
```

Visit http://localhost:3000

## Updating Puzzles

To refresh the puzzle database with new easy puzzles from Lichess:

### 1. Download Lichess puzzle database
```bash
curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst -o lichess_db_puzzle.csv.zst
```

### 2. Decompress the file
```bash
zstd -d lichess_db_puzzle.csv.zst
```

### 3. Extract easy puzzles (rating 800-1400)
```bash
awk -F',' 'NR==1 || ($4 >= 800 && $4 <= 1400)' lichess_db_puzzle.csv | head -202 > easy_puzzles.csv
```

This extracts the header row plus 201 puzzles with ratings between 800 and 1400.

### 4. Convert CSV to JSON
Create `convert_puzzles.js`:

```javascript
import fs from 'fs';

const csvContent = fs.readFileSync('easy_puzzles.csv', 'utf-8');
const lines = csvContent.trim().split('\n');

const puzzles = [];

for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(',');
  const puzzle = {
    id: values[0],
    fen: values[1],
    solution: values[2].split(' '),
    rating: parseInt(values[3]),
    themes: values[7] ? values[7].split(' ') : []
  };
  puzzles.push(puzzle);
}

console.log(`Converted ${puzzles.length} puzzles`);
fs.writeFileSync('server/easy_puzzles.json', JSON.stringify(puzzles, null, 2));
console.log('Written to server/easy_puzzles.json');
```

Run the conversion:
```bash
node convert_puzzles.js
```

### 5. Clean up
```bash
rm lichess_db_puzzle.csv lichess_db_puzzle.csv.zst easy_puzzles.csv convert_puzzles.js
```

### 6. Rebuild Docker
```bash
docker-compose build && docker-compose down && docker-compose up -d
```

## Deployment

### VPS Setup (LunaNode recommended)

1. Create VPS with Ubuntu 22.04
2. Install Docker:
```bash
apt update
apt install docker.io docker-compose
```

3. Clone repo and configure:
```bash
git clone <your-repo>
cd cashu-chess-puzzle
nano .env  # Add WALLET_SEED and ACTIVE_MODE
```

4. Set up nginx + SSL:
```bash
apt install nginx certbot python3-certbot-nginx
```

Configure nginx reverse proxy:
```nginx
server {
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

5. Get SSL certificate:
```bash
certbot --nginx -d yourdomain.com
```

6. Start application:
```bash
docker-compose up -d
```

## Security Considerations

- Keep wallet seed in `.env` file (not in git)
- Only store small amounts (treat as hot wallet)
- Rate limiting prevents abuse
- Backup `wallet-data/wallet.db` regularly
- Use DNS servers (8.8.8.8, 1.1.1.1) for reliability

## Backup Strategy

Daily backup of wallet database:
```bash
# Add to crontab
0 2 * * * tar -czf /root/backups/wallet-$(date +\%Y\%m\%d).tar.gz /path/to/wallet-data/wallet.db
```

## Project Structure

```
cashu-chess-puzzle/
├── docker-compose.yml    # Container orchestration
├── Dockerfile            # Node.js app container
├── .env                  # Environment variables (not in git)
├── .gitignore
├── server/
│   ├── server.js         # Express server + Cashu wallet
│   └── easy_puzzles.json # 201 chess puzzles
├── public/
│   ├── index.html        # Landing page
│   ├── puzzle.html       # Main puzzle interface
│   └── donate.html       # Donation page
└── wallet-data/          # SQLite database (persisted)
    └── wallet.db
```

## License

MIT

## Notes to self

while testing on my laptop:
 - `docker-compose build && docker-compose down && docker-compose up -d` to restart docker after changing some code
 - `docker save -o chessu.tar cashu-chess-puzzle-chessu`
 - `scp chessu.tar root@chessu.cash:`

```
  On the VPS:
  cd ~/cashu-chess-puzzle
  docker-compose down && docker load -i ~/chessu.tar && docker-compose up -d
```
