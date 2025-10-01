# Cashu Chess Puzzle Project

## Overview
A chess puzzle website that rewards users with Cashu tokens (ecash) when they solve puzzles. Users solve puzzles and receive a QR code containing a Cashu token that they can scan with any Cashu wallet app (eNuts, Minibits, Nutstash, etc.).

## Architecture

### Backend (Docker Container)
- **Node.js + Express** server for puzzle validation and Cashu token generation
- **coco-cashu-core + coco-cashu-sqlite3** for wallet management
- **SQLite database** at `/app/data/wallet.db` (persisted via Docker volume)
- **Port 3000** exposed for HTTP requests
- **Security**: Container isolation with minimal network access

### Frontend (Static Files)
- Served from `public/` directory
- Chess puzzle UI with chessboard
- Calls backend API to validate solutions
- Displays QR code with Cashu token on success

### Data Persistence
- `./wallet-data` (host) → `/app/data` (container)
- SQLite database contains wallet seed, keys, and Cashu tokens

## Project Structure
```
cashu-chess-puzzle/
├── server/
│   ├── package.json      # Dependencies: express, coco-cashu-core, coco-cashu-sqlite3, qrcode
│   └── server.js         # Express server with API endpoints
├── public/
│   └── index.html        # Frontend UI (chess puzzle interface)
├── wallet-data/          # Docker volume - SQLite database persisted here
├── Dockerfile            # Node.js 20 slim image
├── docker-compose.yml    # Container orchestration
├── .dockerignore
├── .gitignore
└── CLAUDE.md            # This file
```

## Development Milestones

### ✅ Milestone 1: Project Setup
- [x] Docker + Node.js server structure created
- [x] Basic Express server with health check endpoint
- [x] Docker volume configuration for wallet persistence
- [x] Simple frontend placeholder

### 🔄 Milestone 2: Cashu Backend (IN PROGRESS)
- [ ] Integrate coco-cashu-core + sqlite3 adapter
- [ ] Initialize wallet with test mint (e.g., https://nofees.testnut.cashu.space)
- [ ] Create API endpoint: POST /api/claim-reward
- [ ] Generate Cashu tokens and return as QR code
- [ ] Test with curl/Postman → scan with real Cashu wallet

### 📋 Milestone 3: Chess Puzzle System
- [ ] Implement chess puzzle validation logic
- [ ] Add puzzle database/pool
- [ ] Create frontend chessboard UI
- [ ] Display puzzle with move input

### 🔗 Milestone 4: Integration
- [ ] Connect puzzle solve → token reward flow
- [ ] Add rate limiting (prevent abuse)
- [ ] Add basic security measures
- [ ] End-to-end testing with real Cashu wallet

## Current Todo List
1. ✅ Set up basic project structure (Docker, Node.js server)
2. ⏳ Integrate Cashu wallet backend (coco-cashu-core + sqlite3)
3. ⏳ Build minimal API endpoint to generate/send Cashu tokens
4. ⏳ Test Cashu token generation and QR code display
5. ⏳ Build chess puzzle validation logic
6. ⏳ Create frontend UI for puzzle display and solution input
7. ⏳ Connect puzzle solving to Cashu token reward endpoint
8. ⏳ Add rate limiting and basic security measures
9. ⏳ Test full flow end-to-end with real Cashu wallet

## How It Works (User Flow)
1. User visits `http://your-laptop:3000`
2. Frontend displays a chess puzzle
3. User solves the puzzle (enters correct move)
4. Frontend sends solution to `POST /api/claim-reward`
5. Backend validates solution
6. Backend generates Cashu token via `manager.wallet.send(mintUrl, amount)`
7. Backend returns token as QR code
8. User scans QR code with their Cashu wallet app
9. Tokens appear in user's wallet

## Running the Project

### Build and Start
```bash
cd cashu-chess-puzzle
docker-compose build
docker-compose up
```

### Access
- Frontend: http://localhost:3000
- Health check: http://localhost:3000/health

### Stop
```bash
docker-compose down
```

## Security Considerations
- **Container isolation**: Server runs in Docker with minimal access
- **Limited funds**: Only keep small amounts in wallet (acceptable loss)
- **Volume mount**: Only `/app/data` is accessible from container
- **Rate limiting**: TODO - Add per-IP limits to prevent abuse
- **No encryption**: Database not encrypted (acceptable for small amounts)

## Dependencies
- **express**: Web server framework
- **coco-cashu-core**: Cashu protocol implementation (storage-agnostic)
- **coco-cashu-sqlite3**: SQLite adapter for Node.js
- **qrcode**: QR code generation for token display

## Network Setup
- Users connect via local WiFi network
- Server binds to `0.0.0.0:3000` (accessible from LAN)
- Docker exposes port 3000 to host

## Future Enhancements
- Multiple difficulty levels
- Leaderboard
- Puzzle categories (tactics, endgames, etc.)
- Progressive rewards (harder puzzles = more sats)
- Admin panel to monitor wallet balance
- Automatic wallet refilling from external source

## Notes
- **Alpha software**: coco-cashu is v1.0.0-rc9 (APIs may change)
- **Test mint**: Using https://nofees.testnut.cashu.space for development
- **Amount per puzzle**: TBD (e.g., 10-100 sats)
- **Docker version warning**: `version` field in docker-compose.yml is obsolete (can be removed)

## Next Steps
1. Install dependencies: `cd server && npm install`
2. Integrate Cashu wallet initialization code
3. Create `/api/claim-reward` endpoint
4. Test token generation with curl
5. Add chess puzzle logic
