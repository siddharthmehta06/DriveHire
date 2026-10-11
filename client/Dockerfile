FROM node:20-bookworm-slim

WORKDIR /app

COPY client/package*.json ./
RUN npm ci

COPY client ./

EXPOSE 5173
CMD ["npm", "run", "dev"]
