import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../../test/utils/index.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';
import { type Organisation, type Organisationsbeziehung } from '../../domain/organisation.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationRepository } from '../../persistence/organisation.repository.js';
import { SchultraegerSchuleHatExaktEinenTraeger } from './schultraeger-schule-hat-exakt-einen-traeger.js';

describe('SchultraegerSchuleHatExaktEinenTraeger Specification', () => {
    let sut: SchultraegerSchuleHatExaktEinenTraeger;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    function createBeziehung(
        typ: OrganisationsbeziehungsTyp,
        zielOrganisationId: string = faker.string.uuid(),
    ): Organisationsbeziehung<true> {
        return {
            id: faker.string.uuid(),
            quellOrganisationId: faker.string.uuid(),
            zielOrganisationId,
            typ,
        } as Organisationsbeziehung<true>;
    }

    function createNewBeziehung(zielOrganisationId: string): Organisationsbeziehung<false> {
        return {
            quellOrganisationId: faker.string.uuid(),
            zielOrganisationId,
            typ: OrganisationsbeziehungsTyp.SCHULTRAEGER,
        } as Organisationsbeziehung<false>;
    }

    function createSchule(beziehungen: Organisationsbeziehung<true>[]): Organisation<true, true> {
        const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
        return Object.assign(schule, { organisationsbeziehungen: beziehungen });
    }

    function createZielMap(entries: [string, OrganisationsTyp][]): Map<string, Organisation<true>> {
        return new Map(
            entries.map(([id, typ]: [string, OrganisationsTyp]) => [
                id,
                DoFactory.createOrganisation(true, { id, typ }),
            ]),
        );
    }

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new SchultraegerSchuleHatExaktEinenTraeger(orgaRepoMock);
    });

    it('should return true, if relation typ is not SCHULTRAEGER', async () => {
        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT))).resolves.toBe(true);
        expect(orgaRepoMock.findByIdWithRelationships).not.toHaveBeenCalled();
    });

    it('should return true, if quellOrganisation does not exist', async () => {
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(true);
        expect(orgaRepoMock.findByIds).not.toHaveBeenCalled();
    });

    it('should return true, if quellOrganisation is not a SCHULE', async () => {
        const orga: Organisation<true, true> = Object.assign(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
            { organisationsbeziehungen: [] },
        );
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(orga);

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(true);
        expect(orgaRepoMock.findByIds).not.toHaveBeenCalled();
    });

    it('should return true, if a new relation to a TRAEGER is the only one', async () => {
        const traegerId: string = faker.string.uuid();
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(createSchule([]));
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[traegerId, OrganisationsTyp.TRAEGER]]));

        await expect(sut.isSatisfiedBy(createNewBeziehung(traegerId))).resolves.toBe(true);
    });

    it('should return true, if the given relation is already persisted and not counted twice', async () => {
        const traegerId: string = faker.string.uuid();
        const beziehung: Organisationsbeziehung<true> = createBeziehung(
            OrganisationsbeziehungsTyp.SCHULTRAEGER,
            traegerId,
        );
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(createSchule([beziehung]));
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[traegerId, OrganisationsTyp.TRAEGER]]));

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(true);
        expect(orgaRepoMock.findByIds).toHaveBeenCalledWith([traegerId]);
    });

    it('should return true, if other relations are not SCHULTRAEGER', async () => {
        const traegerId: string = faker.string.uuid();
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(
            createSchule([createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT)]),
        );
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[traegerId, OrganisationsTyp.TRAEGER]]));

        await expect(sut.isSatisfiedBy(createNewBeziehung(traegerId))).resolves.toBe(true);
        expect(orgaRepoMock.findByIds).toHaveBeenCalledWith([traegerId]);
    });

    it('should return false, if the zielOrganisation is not a TRAEGER', async () => {
        const zielId: string = faker.string.uuid();
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(createSchule([]));
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[zielId, OrganisationsTyp.BEHOERDE]]));

        await expect(sut.isSatisfiedBy(createNewBeziehung(zielId))).resolves.toBe(false);
    });

    it('should return false, if the zielOrganisation does not exist', async () => {
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(createSchule([]));
        orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());

        await expect(sut.isSatisfiedBy(createNewBeziehung(faker.string.uuid()))).resolves.toBe(false);
    });

    it('should return false, if the schule would have more than one TRAEGER', async () => {
        const existingTraegerId: string = faker.string.uuid();
        const newTraegerId: string = faker.string.uuid();
        orgaRepoMock.findByIdWithRelationships.mockResolvedValueOnce(
            createSchule([createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, existingTraegerId)]),
        );
        orgaRepoMock.findByIds.mockResolvedValueOnce(
            createZielMap([
                [existingTraegerId, OrganisationsTyp.TRAEGER],
                [newTraegerId, OrganisationsTyp.TRAEGER],
            ]),
        );

        await expect(sut.isSatisfiedBy(createNewBeziehung(newTraegerId))).resolves.toBe(false);
    });
});
