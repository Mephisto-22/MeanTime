FROM node:22-alpine

# Install curl for container inspection and libc6-compat for native binary compatibility
RUN apk add --no-cache curl libc6-compat

# Install pnpm pinned to modern release
RUN npm install -g pnpm@12.8.1

WORKDIR /app

ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=3000

EXPOSE 3000

# Copy package manifests first for efficient Docker layer caching
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* .npmrc* ./

# Install dependencies
RUN pnpm install

# Copy application source
COPY . .

# Copy and setup entrypoint script with Unix line endings
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["pnpm", "dev"]
