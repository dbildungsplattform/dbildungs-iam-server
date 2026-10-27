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

# Deployment Stage
FROM $BASE_IMAGE_BUILDER AS deployment

# CVE-2026-45447
RUN apk upgrade -U libcrypto3>=3.5.7-r0 libssl3>=3.5.7-r0

USER node
ENV NODE_ENV=prod
WORKDIR /app
COPY package*.json ./
COPY config/ ./config/

RUN npm ci --omit-dev

COPY --from=build /app/dist/ ./dist/
COPY /seeding/ /app/seeding/
COPY /keycloak-migrations/ /app/keycloak-migrations/
CMD [ "node", "dist/src/server/main.js" ]
