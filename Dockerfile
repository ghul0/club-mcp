FROM node:26-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
RUN npm install -g pnpm@10.0.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/package.json
COPY packages/http/package.json packages/http/package.json
COPY packages/stdio/package.json packages/stdio/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S hhc && adduser -S hhc -G hhc
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
USER hhc
EXPOSE 3333
# Reserved for v0.2.0 @hhc-mcp/http transport. Docker build is currently
# disabled in release.yml because @hhc-mcp/http ships as scaffold only.
CMD ["node", "packages/http/dist/index.js"]
