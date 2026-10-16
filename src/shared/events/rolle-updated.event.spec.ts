import { faker } from '@faker-js/faker';
import { cloneDeep } from 'lodash-es';
import { DoFactory } from '../../../test/utils/do-factory.js';
import { RollenMerkmal } from '../../modules/rolle/domain/rolle.enums.js';
import { RollenSystemRecht } from '../../modules/rolle/domain/systemrecht.js';
import { type Rolle } from '../../modules/rolle/domain/rolle.js';
import { RolleUpdatedEvent } from './rolle-updated.event.js';

describe('RolleUpdatedEvent', () => {
    it('should correctly initialize and implement RolleUpdatedEvent', () => {
        const rolle: Rolle<true> = DoFactory.createRolle(true);
        const oldRolle: Rolle<true> = cloneDeep(rolle);
        rolle.addMerkmal(faker.helpers.enumValue(RollenMerkmal));
        rolle.addSystemRecht(RollenSystemRecht.KLASSEN_VERWALTEN);

        const event: RolleUpdatedEvent = RolleUpdatedEvent.fromRollen(rolle, oldRolle);

        expect(event).toBeInstanceOf(RolleUpdatedEvent);
        expect(event.id).toEqual(rolle.id);
        expect(event.rollenArt).toEqual(rolle.rollenart);

        expect(event.name).toEqual(rolle.name);
        expect(event.oldName).toEqual(oldRolle.name);

        expect(event.administeredBySchulstrukturknoten).toEqual(rolle.administeredBySchulstrukturknoten);
        expect(event.oldAdministeredBySchulstrukturknoten).toEqual(oldRolle.administeredBySchulstrukturknoten);

        expect(event.merkmale).toEqual(rolle.merkmale);
        expect(event.oldMerkmale).toEqual(oldRolle.merkmale);

        expect(event.systemrechte).toEqual(rolle.systemrechte);
        expect(event.oldSystemrechte).toEqual(oldRolle.systemrechte);

        expect(event.serviceProviderIds).toEqual(rolle.serviceProviderIds);
        expect(event.oldServiceProviderIds).toEqual(oldRolle.serviceProviderIds);
    });
});
