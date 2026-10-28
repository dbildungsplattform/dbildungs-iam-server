ARG BASE_IMAGE_BUILDER=node:24.22.1-alpine3.24

# Build Stage
FROM $BASE_IMAGE_BUILDER AS build

# CVE-2026-45447
RUN apk upgrade -U libcrypto3>=3.5.7-r0 libssl3>=3.5.7-r0

WORKDIR /app
COPY tsconfig*.json ./
COPY package*.json ./

RUN npm ci

COPY src/ src/
COPY migrations/ migrations/

RUN npm run build

# Production Dependencies Stage
FROM $BASE_IMAGE_BUILDER AS prod-dependencies

WORKDIR /app
COPY package*.json ./

RUN npm ci --omit=dev

# Deployment Stage
FROM $BASE_IMAGE_BUILDER AS deployment

# CVE-2026-45447
RUN apk upgrade -U libcrypto3>=3.5.7-r0 libssl3>=3.5.7-r0

# npm/npx are not needed at runtime; removing them drops the vulnerable packages bundled with the npm CLI
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node
ENV NODE_ENV=prod
WORKDIR /app
COPY package*.json ./
COPY config/ ./config/

COPY --from=prod-dependencies /app/node_modules/ ./node_modules/
COPY --from=build /app/dist/ ./dist/
COPY /seeding/ /app/seeding/
COPY /keycloak-migrations/ /app/keycloak-migrations/
CMD [ "node", "dist/src/server/main.js" ]
