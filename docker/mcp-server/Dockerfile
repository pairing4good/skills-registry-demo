FROM node:18-alpine

WORKDIR /app

COPY mcp-server/package.json ./

RUN npm install --only=production

COPY mcp-server/src ./src

EXPOSE 3000

CMD ["node", "src/index.js"]
