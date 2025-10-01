FROM node:20-slim

WORKDIR /app

# Install base dependencies first
RUN npm install express@^4.18.2 qrcode@^1.5.3 sqlite3@^5 @cashu/cashu-ts@^2.7.2

# Copy local coco packages directly into node_modules
COPY coco/packages/core ./node_modules/coco-cashu-core
COPY coco/packages/sqlite3 ./node_modules/coco-cashu-sqlite3

# Copy server code
COPY cashu-chess-puzzle/server/ ./

# Create data directory for wallet database
RUN mkdir -p /app/data

# Copy public files
COPY cashu-chess-puzzle/public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
