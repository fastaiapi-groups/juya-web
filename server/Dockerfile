FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node server/ ./server/
USER node
ARG APP_VERSION=development
ENV NODE_ENV=production MERCHANT_HOST=0.0.0.0 MERCHANT_PORT=3000 APP_VERSION=$APP_VERSION
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/merchant/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
