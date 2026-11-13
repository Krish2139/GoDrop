FROM node:20-alpine

WORKDIR /app

# Install dependencies first for optimal Docker layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

EXPOSE 5000

USER node

CMD ["node", "src/server.js"]

