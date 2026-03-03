# syntax=docker/dockerfile:1

FROM node:lts-slim AS base
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
RUN npm install

FROM base AS build
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN npm run prisma:generate --workspace=@abasto/api
RUN npm run build --workspace=@abasto/shared
RUN npm run build --workspace=@abasto/api

FROM node:lts-slim AS production
WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
RUN npm install --omit=dev

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

WORKDIR /app/apps/api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/src/server.js"]
