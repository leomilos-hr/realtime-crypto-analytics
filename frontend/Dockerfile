FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts
RUN npx prisma generate

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy DB init script
COPY --from=builder /app/init-db.js ./init-db.js

# Create data directory for SQLite
RUN mkdir -p /data

EXPOSE 3100

# Initialize DB tables on startup, then start the app
CMD sh -c "node init-db.js; node server.js"
