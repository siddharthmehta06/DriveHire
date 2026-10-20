FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY server ./server
COPY client ./client
RUN cd client && npm ci

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && npm start"]
