FROM node:18-alpine AS builder

WORKDIR /app

COPY mcp-server/package.json mcp-server/tsconfig.json ./
RUN npm install

COPY mcp-server/src ./src
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY mcp-server/package.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
