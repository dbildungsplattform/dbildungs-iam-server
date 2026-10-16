import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { NurLehrUndLernAnKlasse } from './nur-lehr-und-lern-an-klasse.js';

describe('NurLehrUndLernAnKlasse specification', () => {
    const organisationRepoMock: DeepMocked<OrganisationRepository> = createMock(OrganisationRepository);
    const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should return true, if organisation is klasse and rolle is LEHR', async () => {
        const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(organisationRepoMock, rolleRepoMock);
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE }),
        );
        rolleRepoMock.findById.mockResolvedValueOnce(DoFactory.createRolle(true, { rollenart: RollenArt.LEHR }));

        const pk: Personenkontext<boolean> = DoFactory.createPersonenkontext(false);

        await expect(specification.isSatisfiedBy(pk)).resolves.toBe(true);
    });

    it('should return true, if organisation is klasse and rolle is LERN', async () => {
        const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(organisationRepoMock, rolleRepoMock);
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE }),
        );
        rolleRepoMock.findById.mockResolvedValueOnce(DoFactory.createRolle(true, { rollenart: RollenArt.LERN }));

        const pk: Personenkontext<boolean> = DoFactory.createPersonenkontext(false);

        await expect(specification.isSatisfiedBy(pk)).resolves.toBe(true);
    });

    it('should return true, if organisation is not KLASSE', async () => {
        const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(organisationRepoMock, rolleRepoMock);
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );

        const pk: Personenkontext<boolean> = DoFactory.createPersonenkontext(false);

        await expect(specification.isSatisfiedBy(pk)).resolves.toBe(true);
    });

    it('should return false, if organisation is not found', async () => {
        const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(organisationRepoMock, rolleRepoMock);
        organisationRepoMock.findById.mockResolvedValueOnce(undefined);

        const pk: Personenkontext<boolean> = DoFactory.createPersonenkontext(false);

        await expect(specification.isSatisfiedBy(pk)).resolves.toBe(false);
    });

    it('should return true, if rolle is not found', async () => {
        const specification: NurLehrUndLernAnKlasse = new NurLehrUndLernAnKlasse(organisationRepoMock, rolleRepoMock);
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE }),
        );
        rolleRepoMock.findById.mockResolvedValueOnce(undefined);

        const pk: Personenkontext<boolean> = DoFactory.createPersonenkontext(false);

        await expect(specification.isSatisfiedBy(pk)).resolves.toBe(false);
    });
});
