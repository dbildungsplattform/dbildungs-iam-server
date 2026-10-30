import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../../test/utils/index.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationRepository } from '../../persistence/organisation.repository.js';
import { type OrganisationsbeziehungEntity } from '../../persistence/organisationsbeziehung.entity.js';
import { SchulaufsichtQuelleSchuleZielBehoerde } from './schulaufsicht-quelle-schule-ziel-behoerde.js';

describe('SchulaufsichtQuelleSchuleZielBehoerde Specification', () => {
    let sut: SchulaufsichtQuelleSchuleZielBehoerde;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    function createBeziehung(typ: OrganisationsbeziehungsTyp): OrganisationsbeziehungEntity {
        return {
            typ,
            quellOrganisationId: faker.string.uuid(),
            zielOrganisationId: faker.string.uuid(),
        } as OrganisationsbeziehungEntity;
    }

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new SchulaufsichtQuelleSchuleZielBehoerde(orgaRepoMock);
    });

    it('should return false, if typ is not SCHULAUFSICHT', async () => {
        const beziehung: OrganisationsbeziehungEntity = createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER);

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if quellOrganisation does not exist', async () => {
        const beziehung: OrganisationsbeziehungEntity = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if quellOrganisation is not of typ SCHULE', async () => {
        const beziehung: OrganisationsbeziehungEntity = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
        );

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if zielOrganisation does not exist', async () => {
        const beziehung: OrganisationsbeziehungEntity = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if zielOrganisation is not of typ BEHOERDE', async () => {
        const beziehung: OrganisationsbeziehungEntity = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
        );

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return true, if quellOrganisation is SCHULE and zielOrganisation is BEHOERDE', async () => {
        const beziehung: OrganisationsbeziehungEntity = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.BEHOERDE }),
        );

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(true);
    });
});
