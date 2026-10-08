FROM node:22-alpine

# Install curl for container inspection, libc6-compat for native binary compatibility, and rsync for host synchronization
RUN apk add --no-cache curl libc6-compat rsync

# Install pnpm pinned to modern release
RUN npm install -g pnpm@12.8.1

WORKDIR /app

ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

# Copy package manifests for potential build-time cache
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./

# Copy application source (entrypoint handles node_modules on container start)
COPY . .

# Copy and setup entrypoint script with Unix line endings
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["pnpm", "dev"]
