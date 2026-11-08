FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build?schema=public
RUN npm run db:generate --workspace @homework/api
RUN npm run build --workspace @homework/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
RUN npm ci --omit=dev --workspace @homework/api --workspace @homework/contracts && mkdir -p /app/var/uploads && chown -R node:node /app/var
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
