# MAR: imagen única (API + cliente compilado). La BD (SQLite) vive en /data: monta ahí un disco persistente.
ARG NODE_VERSION=16

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:${NODE_VERSION}-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DB_FILE=/data/mar.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/roadmap ./roadmap
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
VOLUME /data
CMD ["node", "server/dist/index.js"]
