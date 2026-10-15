import { PersonenkontexteUpdateResponse } from './personenkontexte-update.response.js';
import { type Personenkontext } from '../../domain/personenkontext.js';
import { DoFactory } from '../../../../../test/utils/do-factory.js';

describe('PersonenkontexteUpdateResponse', () => {
    describe('constructor', () => {
        it('should create instance', () => {
            const pk: Personenkontext<true> = DoFactory.createPersonenkontext<true>(true);
            const pkUpdateResponse: PersonenkontexteUpdateResponse = new PersonenkontexteUpdateResponse([pk]);

            expect(pkUpdateResponse.dBiamPersonenkontextResponses).toHaveLength(1);
        });
    });
});
