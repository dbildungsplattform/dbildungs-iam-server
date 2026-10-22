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
        sut = new SchultraegerSchuleUndTraegerSelberBaum(orgaRepoMock);
    });

    it('should return true, if typ is not SCHULE', async () => {
        const orga: Organisation<true, true> = Object.assign(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.TRAEGER }),
            { organisationsbeziehungen: [] },
        );

        await expect(sut.isSatisfiedBy(orga)).resolves.toBe(true);
        expect(orgaRepoMock.findByIds).not.toHaveBeenCalled();
    });

    it('should return true, if there are no SCHUL-TRAEGER relations', async () => {
        orgaRepoMock.findByIds.mockResolvedValueOnce(new Map());
        orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValue(
            RootDirectChildrenType.OEFFENTLICH,
        );

        await expect(
            sut.isSatisfiedBy(
                createSchule([createBeziehung(OrganisationsbeziehungsTyp.SCHULAUFSICHT, faker.string.uuid())]),
            ),
        ).resolves.toBe(true);
        expect(orgaRepoMock.findByIds).toHaveBeenCalledWith([]);
    });

    it('should ignore referenced organisations that are not a TRAEGER', async () => {
        const behoerdeId: string = faker.string.uuid();
        const schule: Organisation<true, true> = createSchule([
            createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, behoerdeId),
        ]);
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[behoerdeId, OrganisationsTyp.BEHOERDE]]));
        orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValue(
            RootDirectChildrenType.OEFFENTLICH,
        );

        await expect(sut.isSatisfiedBy(schule)).resolves.toBe(true);
        expect(orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich).toHaveBeenCalledTimes(1);
    });

    it('should return true, if SCHULE and TRAEGER are in the same tree', async () => {
        const traegerId: string = faker.string.uuid();
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[traegerId, OrganisationsTyp.TRAEGER]]));
        orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockResolvedValue(RootDirectChildrenType.ERSATZ);

        await expect(
            sut.isSatisfiedBy(createSchule([createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, traegerId)])),
        ).resolves.toBe(true);
    });

    it('should return false, if SCHULE and TRAEGER are in different trees', async () => {
        const traegerId: string = faker.string.uuid();
        const schule: Organisation<true, true> = createSchule([
            createBeziehung(OrganisationsbeziehungsTyp.SCHULTRAEGER, traegerId),
        ]);
        orgaRepoMock.findByIds.mockResolvedValueOnce(createZielMap([[traegerId, OrganisationsTyp.TRAEGER]]));
        orgaRepoMock.findOrganisationZuordnungErsatzOderOeffentlich.mockImplementation((id: string) =>
            Promise.resolve(id === schule.id ? RootDirectChildrenType.OEFFENTLICH : RootDirectChildrenType.ERSATZ),
        );

        await expect(sut.isSatisfiedBy(schule)).resolves.toBe(false);
    });
});
