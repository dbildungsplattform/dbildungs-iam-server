import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../../test/utils/index.js';
import { OrganisationsTyp } from '../../domain/organisation.enums.js';
import { type Organisationsbeziehung } from '../../domain/organisation.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationRepository } from '../../persistence/organisation.repository.js';
import { SchulaufsichtQuelleSchuleZielBehoerde } from './schulaufsicht-quelle-schule-ziel-behoerde.js';

describe('SchulaufsichtQuelleSchuleZielBehoerde Specification', () => {
    let sut: SchulaufsichtQuelleSchuleZielBehoerde;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    function createBeziehung(typ: OrganisationsbeziehungsTyp): Organisationsbeziehung<true> {
        return DoFactory.createOrganisationsbeziehung(true, { typ });
    }

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new SchulaufsichtQuelleSchuleZielBehoerde(orgaRepoMock);
    });

    it('should return false, if typ is not SCHULAUFSICHT', async () => {
        const beziehung: Organisationsbeziehung<true> = createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER);

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if quellOrganisation does not exist', async () => {
        const beziehung: Organisationsbeziehung<true> = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if quellOrganisation is not of typ SCHULE', async () => {
        const beziehung: Organisationsbeziehung<true> = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
        );

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if zielOrganisation does not exist', async () => {
        const beziehung: Organisationsbeziehung<true> = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return false, if zielOrganisation is not of typ BEHOERDE', async () => {
        const beziehung: Organisationsbeziehung<true> = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
        );

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(false);
    });

    it('should return true, if quellOrganisation is SCHULE and zielOrganisation is BEHOERDE', async () => {
        const beziehung: Organisationsbeziehung<true> = createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT);
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.BEHOERDE }),
        );

        await expect(sut.isSatisfiedBy(beziehung)).resolves.toBe(true);
    });
});
