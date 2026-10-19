import { faker } from '@faker-js/faker';
import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';

import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../persistence/dbiam-personenkontext.repo.js';
import { GleicheRolleAnKlasseWieSchule } from './gleiche-rolle-an-klasse-wie-schule.js';

describe('GleicheRolleAnKlasseWieSchule specification', () => {
    const organisationRepoMock: DeepMocked<OrganisationRepository> = createMock(OrganisationRepository);
    const personenkontextRepoMock: DeepMocked<DBiamPersonenkontextRepo> = createMock(DBiamPersonenkontextRepo);
    const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should return true, if all checks pass', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        const schuleId: string = faker.string.uuid();
        const rolleId: string = faker.string.uuid();
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, administriertVon: schuleId }),
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE, id: schuleId }),
        );
        personenkontextRepoMock.findByPerson.mockResolvedValueOnce([
            DoFactory.createPersonenkontext(true, { organisationId: schuleId }),
        ]);
        rolleRepoMock.findById.mockResolvedValueOnce(DoFactory.createRolle(true, { id: rolleId }));

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false, { rolleId });

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(true);
    });

    it('should return true, if organisation is not Klasse', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false);

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(true);
    });

    it('should return false, if organisation does not exist', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        organisationRepoMock.findById.mockResolvedValueOnce(undefined);

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false);

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(false);
    });

    it('should return false, if organisation does not have administriertVon', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, administriertVon: undefined }),
        );

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false);

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(false);
    });

    it('should return false, if parent organisation can not be found', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, administriertVon: faker.string.uuid() }),
        );
        organisationRepoMock.findById.mockResolvedValueOnce(undefined);

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false);

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(false);
    });

    it('should return false, if no matching personenkontext can be found', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, administriertVon: faker.string.uuid() }),
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE }),
        );
        personenkontextRepoMock.findByPerson.mockResolvedValueOnce([DoFactory.createPersonenkontext(true)]);

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false);

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(false);
    });

    it('should return false, if no rolle can be found', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        const schuleId: string = faker.string.uuid();
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, administriertVon: schuleId }),
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE, id: schuleId }),
        );
        personenkontextRepoMock.findByPerson.mockResolvedValueOnce([
            DoFactory.createPersonenkontext(true, { organisationId: schuleId }),
        ]);
        rolleRepoMock.findById.mockResolvedValueOnce(undefined);

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false);

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(false);
    });

    it('should return false, if rollen ids do not match', async () => {
        const spec: GleicheRolleAnKlasseWieSchule = new GleicheRolleAnKlasseWieSchule(
            organisationRepoMock,
            personenkontextRepoMock,
            rolleRepoMock,
        );
        const schuleId: string = faker.string.uuid();
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE, administriertVon: schuleId }),
        );
        organisationRepoMock.findById.mockResolvedValueOnce(
            DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE, id: schuleId }),
        );
        personenkontextRepoMock.findByPerson.mockResolvedValueOnce([
            DoFactory.createPersonenkontext(true, { organisationId: schuleId }),
        ]);
        rolleRepoMock.findById.mockResolvedValueOnce(DoFactory.createRolle(true));

        const pk: Personenkontext<false> = DoFactory.createPersonenkontext(false);

        await expect(spec.isSatisfiedBy(pk)).resolves.toBe(false);
    });
});
