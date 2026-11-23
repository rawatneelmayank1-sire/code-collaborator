# One image: builds the client, then runs the Node server that serves it plus the API and WebSocket.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json .npmrc ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --no-audit --no-fund
COPY shared shared
COPY client client
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npm run build -w client

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0 DATA_DIR=/data
WORKDIR /app
COPY package.json .npmrc ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install --omit=dev -w server --no-audit --no-fund && npm cache clean --force
COPY shared shared
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "server/src/index.js"]
