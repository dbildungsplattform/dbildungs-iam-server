import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../../test/utils/index.js';
import { OrganisationsTyp, RootDirectChildrenType } from '../../domain/organisation.enums.js';
import { type Organisation, type Organisationsbeziehung } from '../../domain/organisation.js';
import { OrganisationsbeziehungsTyp } from '../../domain/organisationsbeziehungs-typ.enum.js';
import { OrganisationRepository } from '../../persistence/organisation.repository.js';
import { SchultraegerSchuleUndTraegerSelberBaum } from './schultraeger-schule-und-traeger-selber-baum.js';

describe('SchultraegerSchuleUndTraegerSelberBaum Specification', () => {
    let sut: SchultraegerSchuleUndTraegerSelberBaum;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;

    function createBeziehung(typ: OrganisationsbeziehungsTyp): Organisationsbeziehung<true> {
        return {
            id: faker.string.uuid(),
            quellOrganisationId: faker.string.uuid(),
            zielOrganisationId: faker.string.uuid(),
            typ,
        } as Organisationsbeziehung<true>;
    }

    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new SchultraegerSchuleUndTraegerSelberBaum(orgaRepoMock);
    });

    it('should return false, if relation typ is not SCHULTRAEGER', async () => {
        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT))).resolves.toBe(false);
        expect(orgaRepoMock.findById).not.toHaveBeenCalled();
    });

    it('should return false, if quellOrganisation does not exist', async () => {
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(false);
        expect(orgaRepoMock.findById).toHaveBeenCalledTimes(1);
    });

    it('should return false, if quellOrganisation is not a SCHULE', async () => {
        orgaRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
        );

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(false);
        expect(orgaRepoMock.findById).toHaveBeenCalledTimes(1);
    });

    it('should return false, if zielOrganisation does not exist', async () => {
        orgaRepoMock.findById
            .mockResolvedValueOnce(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }))
            .mockResolvedValueOnce(undefined);

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(false);
        expect(orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich).not.toHaveBeenCalled();
    });

    it('should return false, if zielOrganisation is not a TRAEGER', async () => {
        orgaRepoMock.findById
            .mockResolvedValueOnce(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }))
            .mockResolvedValueOnce(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.BEHOERDE }));

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(false);
        expect(orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich).not.toHaveBeenCalled();
    });

    it('should return true, if SCHULE and TRAEGER are in the same tree', async () => {
        orgaRepoMock.findById
            .mockResolvedValueOnce(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }))
            .mockResolvedValueOnce(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }));
        orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValue(RootDirectChildrenType.ERSATZ);

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(true);
    });

    it('should return false, if SCHULE and TRAEGER are in different trees', async () => {
        const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
        orgaRepoMock.findById
            .mockResolvedValueOnce(schule)
            .mockResolvedValueOnce(DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }));
        orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockImplementation((id: string) =>
            Promise.resolve(id === schule.id ? RootDirectChildrenType.OEFFENTLICH : RootDirectChildrenType.ERSATZ),
        );

        await expect(sut.isSatisfiedBy(createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER))).resolves.toBe(false);
    });
});
