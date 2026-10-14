FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY app ./app
COPY public ./public
COPY scripts ./scripts
COPY THIRD_PARTY.md ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/server.mjs ./scripts/server.mjs
COPY --from=build /app/scripts/redandblack.mjs ./scripts/redandblack.mjs
USER node
EXPOSE 5173
CMD ["node", "scripts/server.mjs", "--dist", "--host", "0.0.0.0", "--port", "5173"]
