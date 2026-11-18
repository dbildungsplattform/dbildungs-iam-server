import { SchulconnexPushApiTestServer } from './schulconnex-push-api-test-server.js';

const server: SchulconnexPushApiTestServer = new SchulconnexPushApiTestServer();

await server.start(3000);

console.info(`Schulconnex Push API Test Server running at ${server.url}`);
