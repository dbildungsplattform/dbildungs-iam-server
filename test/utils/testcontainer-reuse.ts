import { randomInt } from 'node:crypto';

/**
 * Starts a reusable ({@link https://node.testcontainers.org | testcontainers} `.withReuse()`) container while
 * tolerating the races that happen when several parallel Vitest workers request the same fixed-name container at
 * once:
 * - HTTP 409 (name conflict): the first worker wins the Docker `create`, the others collide on the name.
 * - HTTP 304 (already started): a worker reuses the container another worker just started.
 *
 * Both mean another worker is bringing the shared container up. On retry, reuse finds the running container and
 * returns it instead of creating/starting a new one.
 */
export async function startReusableContainer<T>(start: () => Promise<T>, attemptsLeft: number = 15): Promise<T> {
    try {
        return await start();
    } catch (error: unknown) {
        const message: string = error instanceof Error ? error.message : '';
        const isReuseRace: boolean =
            message.includes('already in use') ||
            message.includes('HTTP code 409') ||
            message.includes('already started') ||
            message.includes('HTTP code 304');

        if (!isReuseRace || attemptsLeft <= 1) {
            throw error;
        }

        // Another worker is currently bringing the shared container up; back off and let reuse pick it up on retry.
        const delayMs: number = randomInt(500, 2000);
        await new Promise<void>((resolve: () => void) => {
            setTimeout(resolve, delayMs);
        });

        return startReusableContainer(start, attemptsLeft - 1);
    }
}
