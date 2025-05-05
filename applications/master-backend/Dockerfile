# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install necessary tools: curl for downloading, bash for scripts, git might be needed for some npm packages, openssl for Helm checksum
RUN apk add --no-cache curl bash git openssh-client openssl

# Install kubectl
ARG KUBECTL_VERSION=v1.29.3 # Specify desired kubectl version
RUN curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/kubectl

# Install Helm
ARG HELM_VERSION=v3.14.4 # Specify desired Helm version
RUN curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 && \
    chmod 700 get_helm.sh && \
    ./get_helm.sh --version ${HELM_VERSION} && \
    rm get_helm.sh

# Add required Helm repositories
RUN helm repo add bitnami https://charts.bitnami.com/bitnami

# Create app directory
WORKDIR /app

# Copy package files and install all dependencies
COPY applications/master-backend/package*.json ./
RUN npm install

# Copy the rest of the application code (source and tsconfig)
COPY applications/master-backend/src ./src
COPY applications/master-backend/tsconfig.json ./
COPY applications/master-backend/.env ./

# Build TypeScript code
RUN npm run build

# Add command to list build output for debugging
RUN echo "Listing contents of dist directory:" && ls -R dist

# Prune devDependencies for the final stage (optional, reduces node_modules size)
# RUN npm prune --production


# Stage 2: Production stage
FROM node:20-alpine AS production

# Install runtime dependencies: git for cloning charts, bash/curl might be needed by scripts
RUN apk add --no-cache git bash curl

WORKDIR /app

# Copy necessary binaries from the builder stage
COPY --from=builder /usr/local/bin/kubectl /usr/local/bin/kubectl
COPY --from=builder /usr/local/bin/helm /usr/local/bin/helm

# Copy production dependencies (or all if prune wasn't used)
COPY --from=builder /app/node_modules ./node_modules

# Copy built code and essential files from builder stage
COPY --from=builder /app/dist ./dist/
COPY --from=builder /app/node_modules ./node_modules/
COPY --from=builder /app/package.json ./
# COPY --from=builder /app/.env ./ # Avoid copying .env, use K8s secrets/configmaps instead

# Expose the application port (ensure it matches the port your app listens on)
# Defaulting to 3001 as seen in index.ts, but use ENV var if configurable
EXPOSE 3001

# Define the command to run the application
# Assumes your build output is in 'dist' and the main file is 'index.js'
CMD ["node", "dist/index.js"] 