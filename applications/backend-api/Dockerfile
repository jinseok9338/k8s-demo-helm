# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy application code
COPY src ./src

# Copy knexfile.js and migrations
COPY knexfile.cjs ./
COPY migrations ./migrations

# Stage 2: Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built artifacts from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src ./src
COPY --from=builder /app/knexfile.cjs ./
COPY --from=builder /app/migrations ./migrations

# Expose the application port
EXPOSE 3000

# Start the application
CMD [ "node", "src/index.js" ] 