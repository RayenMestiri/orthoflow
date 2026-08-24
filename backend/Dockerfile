FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json eslint.config.js ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system orthoflow && useradd --system --gid orthoflow orthoflow
COPY --from=build --chown=orthoflow:orthoflow /app/package.json /app/package-lock.json ./
COPY --from=build --chown=orthoflow:orthoflow /app/node_modules ./node_modules
COPY --from=build --chown=orthoflow:orthoflow /app/dist ./dist
USER orthoflow
EXPOSE 4000
CMD ["node", "dist/server.js"]
