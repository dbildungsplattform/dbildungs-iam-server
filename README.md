# dBildungs IAM Server

## Prerequisites

- Node in the version stated in the [package.json](./package.json)
- Container Runtime [Rancher-Desktop](https://www.rancher.com/products/rancher-desktop), Docker or Podman
    - Is required for local setup and integration tests

## Local Setup

1. Clone this repository. Make sure that `git autorcrlf` is set to `false`. You can set this with `git config --global core.autocrlf false`. Otherwise Kafke will not run properly in the later steps.
2. Run `npm ci` to install all dependencies ([What's that?](https://docs.npmjs.com/cli/v9/commands/npm-ci))
3. Before starting the `third-party` profile, create a `.env` file in the repository root (next to `compose.yaml`) with the following values, which are needed by Keycloak's realm import:
    ```
    VIDIS_CLIENT_SECRET=irgendein-secret
    VIDIS_KEYCLOAK_CLIENT_ID=vidis-test
    VIDIS_REDIRECT_URI=https://<vidis-uri>/*
    VIDIS_LOCAL_BACKCHANNEL_LOGOUT_URL=https://<vidis-uri>/auth
    KC_NEXTCLOUD_CLIENT_ID=nextcloud
    KC_NEXTCLOUD_CLIENT_SECRET=irgendein-secret
    ```
4. Start the required services from the `compose.yaml` file with `docker compose --profile third-party up` ([What's that?](https://docs.docker.com/compose/))
    - db
    - keycloak
    - redis
5. run `npm run setup` to initialize the DB and seed data
6. Run `npm run start` to start the server
7. Server runs on the url printed in the console
8. The client and how to run it is described in the [client repo](https://github.com/dBildungsplattform/schulportal-client)

## Scripts for Development

| Command                  | Description                                                           | Hint                                           |
| :----------------------- | :-------------------------------------------------------------------- | :--------------------------------------------- |
| **Setup**                |                                                                       |                                                |
| npm ci                   | Installs all required dependencies                                    |                                                |
| **Build**                |                                                                       |                                                |
| npm run build            | Compiles all `*.ts` files                                             |                                                |
| **Run**                  |                                                                       |                                                |
| npm run start            | Starts the server                                                     | No debug port                                  |
| npm run start:debug      | Starts the server in debug mode                                       | Debug port is open                             |
| npm run start:prod       | Starts the server in production mode                                  |                                                |
| **Test**                 |                                                                       |                                                |
| npm run test:cov         | Runs all tests with coverage                                          | Success is a merge requirement                 |
| npm run test:unit        | Runs only unit tests                                                  | Files with `*.spec.ts` ending                  |
| npm run test:integration | Runs only integration tests                                           | Files with `*.integration-spec.ts` ending      |
| npm run test:watch       | Starts the interactive watch mode                                     |                                                |
| **Lint**                 |                                                                       |                                                |
| npm run format           | Runs the formatter                                                    |                                                |
| npm run lint             | Runs the linter                                                       | Success is a merge requirement                 |
| npm run lint:fix         | Runs the linter and fixes auto fixable problems                       |                                                |
| **Console Applications** |                                                                       |                                                |
| npm run setup            | Runs db:init to Initialize the DB                                     |                                                |
| npm run db:init          | Initializes the database (applies SQL schema)                         | `compose.yaml` can be used                     |
| npm run db:seed DATA_DIR | Creates seeding-data. DATA_DIR is required, FILES_TO_EXCLUDE optional | e.g. npm run db:seed DATA_DIR FILES_TO_EXCLUDE |

## Docker Compose

The compose file includes different [profiles](https://docs.docker.com/compose/how-tos/profiles/) so you can mix and match between them to fit your usecase. For an overview see [Available profiles](#available-profiles).

If you only need to run the server, you can start it and all it's required dependencies with docker compose by running

```sh
docker compose --profile backend up
```

Optional dependencies are in the `third-party` profile. So for the complete backend run

```sh
docker compose --profile backend --profile third-party up
```

The frontend-client (and a necessary ingress) can be started with the `frontend` profile, assuming a certificate for the ingress has been created. You can use `create-cert.sh` inside `nginx/` to do so. Afterwards you can start front- and backend together with:

```sh
docker compose --profile backend --profile frontend up
```

> [!TIP]
> If an error occurs like 'Error response from daemon: network c28f1... not found',
> you can clean docker resources up with _docker system prune -a_.

To bootstrap a minimal setup with front- and backend use `docker-bootstrap.sh`. Depending on your setup you may need to set the correct permissions for the script with i.e. `chmod +x docker-bootstrap.sh`. It will start required services and init and seed the database. **Please note** that this will clear the database.

If you need to initialize the database without seeding it, use `docker compose up db-init` do so.
You can also use another profile, if you want to initialize the db while starting the server `docker compose --profile backend --profile db-init up`
Similarly you may use

- `db-migrate` to migrate schema changes to your current database
- `db-seed` to seed the database
- `keycloak-client-update` to update the keycloak client

### Available profiles

| Name                   | Description                                                         |
| :--------------------- | :------------------------------------------------------------------ |
| backend                | backend with required depencies                                     |
| frontend               | frontend + ingress (requires containerized instance of the backend) |
| third-party            | any third-party systems that are not required for startup           |
| db-init                | initialise the database                                             |
| db-migrate             | run necessary schema migrations against the database                |
| db-seed                | seed the database                                                   |
| keycloak-client-update | update the keycloak-client                                          |
| kc-service             | start the internal micro-service to access keycloaks database       |

## Developer Guides

- Code conventions are enforced through the compile, eslint and prettier as far as possible
    - Non enforcable conventions will be documented here. If they become enforcable we will put them into
      automation.
    - Table names will be all lowercase if the name contains multiple words they will be separated by
      underscores.
- Git conventions can be found [here](./docs/git.md)
- Test conventions can be found [here](./docs/tests.md)
- Configuration conventions can be found [here](./docs/config.md)
- Authentication guides can be found [here](./docs/auth.md)
- Developer notes can be found [here](./docs/developer-notes.md)
- Seeding notes can be found [here](./docs/seeding.md)
- Migration notes can be found [here](./docs/migration.md)

## Testing Guides

- Help on how to test API with Insomnia can be found at [API manuell lokal testen mit Insomnia](./docs/test-api-with-insomnia.md)

## Package (Create Docker Image )

If you push a tag upstream a container will be created for you. (Check Github under Packages)

ghcr.io/dbildungsplattform/dbildungs-iam-server:_tag_

## License

The software is licensed under the [EUPL-1.2 license](./LICENSE).
