FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

ENV DATA_DIR=/app/data
ENV NODE_ENV=production

CMD ["node", "server.js"]
