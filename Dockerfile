# Monks Internal Management: one image serving the API and the built SPA.
#
#   docker build -t hm-internal .
#   docker run ... hm-internal                      # start the server (default)
#   docker run ... hm-internal migrate              # release step: apply pending migrations, then exit
#   docker run -it ... hm-internal create-admin --email you@example.com
#   docker run ... hm-internal mail-test --to you@example.com
#
# Migrations never run on boot; run "migrate" as a separate step on every deploy (see docs/DEPLOY.md).
# There is no seed in this image: the dev seed script and seed SQL are not copied.

# ---- build: full install (dev dependencies included), then build the client and the server ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund
COPY client client
COPY server server
RUN npm run build

# ---- runtime: production dependencies of the server only, compiled code, migrations, built client ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci --omit=dev --workspace=server --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY server/db/migrations server/db/migrations
COPY docker/entrypoint.sh /usr/local/bin/hm-entrypoint
# No seed in production: drop the compiled dev seed script (its SQL file is never copied).
RUN rm -f server/dist/scripts/seed.js server/dist/scripts/seed.js.map \
    && chmod 755 /usr/local/bin/hm-entrypoint \
    && chown -R root:root /app && chmod -R a-w /app

# The image's built-in unprivileged "node" user; the app directory is read-only for it.
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["hm-entrypoint"]
CMD ["start"]
