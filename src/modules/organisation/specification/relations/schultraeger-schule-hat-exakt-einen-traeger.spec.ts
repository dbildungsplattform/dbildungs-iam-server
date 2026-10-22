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
        zielOrganisationId: string,
    ): Organisationsbeziehung<true> {
        return {
            id: faker.string.uuid(),
            quellOrganisationId: faker.string.uuid(),
            zielOrganisationId,
            typ,
        } as Organisationsbeziehung<true>;
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

    it('should return false, if typ is not SCHULE', async () => {
        const orga: Organisation<true, true> = Object.assign(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
            { organisationsbeziehungen: [] },
        );

        await expect(sut.isSatisfiedBy(orga)).resolves.toBe(false);
    });

    it('should return false, if there are no relations', async () => {
        orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());

        await expect(sut.isSatisfiedBy(createSchule([]))).resolves.toBe(false);
    });

    it('should return false, if relation typ is not SCHULTRAEGER', async () => {
        const zielId: string = faker.string.uuid();
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([]));

        await expect(
            sut.isSatisfiedBy(createSchule([createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT, zielId)])),
        ).resolves.toBe(false);
    });

    it('should return false, if the zielOrganisation is not a TRAEGER', async () => {
        const zielId: string = faker.string.uuid();
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[zielId, OrganisationsTyp.BEHOERDE]]));

        await expect(
            sut.isSatisfiedBy(createSchule([createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, zielId)])),
        ).resolves.toBe(false);
    });

    it('should return false, if the zielOrganisation does not exist', async () => {
        const zielId: string = faker.string.uuid();
        orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());

        await expect(
            sut.isSatisfiedBy(createSchule([createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, zielId)])),
        ).resolves.toBe(false);
    });

    it('should return false, if more than one TRAEGER is referenced', async () => {
        const zielId1: string = faker.string.uuid();
        const zielId2: string = faker.string.uuid();
        orgaRepoMock.findByIds.mockResolvedValueOnce(
            createZielMap([
                [zielId1, OrganisationsTyp.TRAEGER],
                [zielId2, OrganisationsTyp.TRAEGER],
            ]),
        );

        await expect(
            sut.isSatisfiedBy(
                createSchule([
                    createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, zielId1),
                    createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, zielId2),
                ]),
            ),
        ).resolves.toBe(false);
    });

    it('should return true, if exactly one SCHULTRAEGER relation references a TRAEGER', async () => {
        const traegerId: string = faker.string.uuid();
        const behoerdeId: string = faker.string.uuid();
        orgaRepoMock.findByIds.mockResolvedValueOnce(
            createZielMap([
                [traegerId, OrganisationsTyp.TRAEGER],
                [behoerdeId, OrganisationsTyp.BEHOERDE],
            ]),
        );

        await expect(
            sut.isSatisfiedBy(
                createSchule([
                    createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, traegerId),
                    createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT, behoerdeId),
                ]),
            ),
        ).resolves.toBe(true);
    });
});
