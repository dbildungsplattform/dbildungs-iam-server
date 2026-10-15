import { DoFactory } from '../../../../test/utils/do-factory.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RolleRefResponse } from './rolle-ref.response.js';

describe('RolleRefResponse', () => {
    it('should set hasLogo to false', () => {
        const rolle: Rolle<true> = DoFactory.createRolle(true, {});

        const response: RolleRefResponse = RolleRefResponse.fromRolle(rolle);

        expect(response.id).toBe(rolle.id);
        expect(response.name).toBe(rolle.name);
    });
});
