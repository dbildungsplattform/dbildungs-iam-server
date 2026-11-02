/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';

export type RecordedPushApiRequest = {
    timestamp: string;
    method: string;
    path: string;
    params: Record<string, string>;
    query: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
};

/**
 * Standalone express server for testing purposes only.
 * Implements ./spec/openapi.yaml
 * Inspection endpoints (not part of the spec):
 * - GET    /__test/requests  -> returns all recorded requests (in order of arrival)
 * - DELETE /__test/requests  -> clears all recorded requests
 */
export class SchulconnexPushApiTestServer {
    public static readonly INSPECTION_PATH: string = '/__test/requests';

    private readonly app: Express;

    private readonly requests: RecordedPushApiRequest[] = [];

    private server: Server | undefined;

    public constructor() {
        this.app = express();
        this.app.use(express.json());
        this.app.use(this.invalidJsonHandler);

        this.app.get(SchulconnexPushApiTestServer.INSPECTION_PATH, (_req: Request, res: Response) => {
            res.status(200).json(this.requests);
        });
        this.app.delete(SchulconnexPushApiTestServer.INSPECTION_PATH, (_req: Request, res: Response) => {
            this.clearRequests();
            res.status(204).send();
        });

        this.app.put('/v1/personen/:personId', this.record);
        this.app.delete('/v1/personen/:personId', this.record);
        this.app.put('/v1/personen/:personId/personenkontexte/:personenkontextId', this.record);
        this.app.delete('/v1/personen/:personId/personenkontexte/:personenkontextId', this.record);
    }

    public async start(port: number = 0): Promise<void> {
        if (this.server) {
            throw new Error('SchulconnexPushApiTestServer is already running');
        }

        await new Promise<void>((resolve: () => void, reject: (err: Error) => void) => {
            const server: Server = this.app.listen(port, '127.0.0.1', (err?: Error) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.server = server;
                resolve();
            });
        });
    }

    public async stop(): Promise<void> {
        const server: Server | undefined = this.server;
        if (!server) {
            return;
        }
        this.server = undefined;

        await new Promise<void>((resolve: () => void) => {
            server.close(() => resolve());
            server.closeAllConnections();
        });
    }

    public get port(): number {
        if (!this.server) {
            throw new Error('SchulconnexPushApiTestServer is not running');
        }
        return (this.server.address() as AddressInfo).port;
    }

    public get url(): string {
        return `http://127.0.0.1:${this.port}`;
    }

    public getRequests(): RecordedPushApiRequest[] {
        return [...this.requests];
    }

    public clearRequests(): void {
        this.requests.length = 0;
    }

    private readonly record = (req: Request, res: Response): void => {
        const recorded: RecordedPushApiRequest = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            params: { ...(req.params as Record<string, string>) },
            query: { ...req.query },
            headers: { ...req.headers },
            body: req.body as unknown,
        };

        this.requests.push(recorded);
        console.info(`[SchulconnexPushApiTestServer] ${JSON.stringify(recorded, null, 2)}`);

        res.status(202).send();
    };

    private readonly invalidJsonHandler = (err: unknown, req: Request, res: Response, next: NextFunction): void => {
        if (err instanceof SyntaxError) {
            console.info(`[SchulconnexPushApiTestServer] Invalid JSON received on ${req.method} ${req.path}`);
            res.status(400).json({ message: 'Invalid JSON body' });
            return;
        }
        next(err);
    };
}
