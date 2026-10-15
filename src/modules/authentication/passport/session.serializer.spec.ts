import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock } from 'vitest';

import { SessionSerializer } from './session.serializer.js';

describe('SessionSerializer', () => {
    let module: TestingModule;
    let sut: SessionSerializer;

    beforeAll(async () => {
        module = await Test.createTestingModule({
            providers: [SessionSerializer],
        }).compile();

        sut = module.get(SessionSerializer);
    });

    afterAll(async () => {
        await module.close();
    });

    it('should be defined', () => {
        expect(sut).toBeDefined();
    });

    describe('serializeUser', () => {
        it('should pass user to callback', () => {
            const done: Mock = vi.fn();
            const user: object = {};

            sut.serializeUser(user, done);

            expect(done).toHaveBeenCalledWith(null, user);
        });
    });

    describe('deserializeUser', () => {
        it('should pass payload to callback', () => {
            const done: Mock = vi.fn();
            const payload: object = {};

            sut.deserializeUser(payload, done);

            expect(done).toHaveBeenCalledWith(null, payload);
        });
    });
});
