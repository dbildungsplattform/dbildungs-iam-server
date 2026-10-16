import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/do-factory.js';
import { OrganisationsTyp } from '../../organisation/domain/organisation.enums.js';
import { type Organisation } from '../../organisation/domain/organisation.js';
import { OrganisationRepository } from '../../organisation/persistence/organisation.repository.js';
import { RollenArt } from '../../rolle/domain/rolle.enums.js';
import { type Rolle } from '../../rolle/domain/rolle.js';
import { RolleRepo } from '../../rolle/repo/rolle.repo.js';
import { type Personenkontext } from '../domain/personenkontext.js';
import { LernAnSchuleUndKlasse } from './lern-an-schule-und-klasse.js';

describe('LernAnSchuleUndKlasse specification', () => {
    const organisationRepoMock: DeepMocked<OrganisationRepository> = createMock(OrganisationRepository);
    const rolleRepoMock: DeepMocked<RolleRepo> = createMock(RolleRepo);
    const sut: LernAnSchuleUndKlasse = new LernAnSchuleUndKlasse(organisationRepoMock, rolleRepoMock);

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should return true, if there are no personenkontexte with rollenart LERN', async () => {
        const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LEHR });
        const pks: Array<Personenkontext<true>> = [DoFactory.createPersonenkontext(true, { rolleId: rolle.id })];
        rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));

        await expect(sut.isSatisfiedBy(pks)).resolves.toBe(true);
    });

    it('should return true, if every pk has a matching pk at the correct schule/klasse', async () => {
        const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LERN });

        const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });
        const klasse: Organisation<true> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.KLASSE,
            administriertVon: schule.id,
        });

        const pks: Array<Personenkontext<true>> = [
            DoFactory.createPersonenkontext(true, { organisationId: schule.id, rolleId: rolle.id }),
            DoFactory.createPersonenkontext(true, { organisationId: klasse.id, rolleId: rolle.id }),
        ];
        rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));
        organisationRepoMock.findByIds.mockResolvedValueOnce(
            new Map([
                [schule.id, schule],
                [klasse.id, klasse],
            ]),
        );

        await expect(sut.isSatisfiedBy(pks)).resolves.toBe(true);
    });

    it('should return false, if a pk at a schule has no matching klasse', async () => {
        const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LERN });

        const schule: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.SCHULE });

        const pks: Array<Personenkontext<true>> = [
            DoFactory.createPersonenkontext(true, { organisationId: schule.id, rolleId: rolle.id }),
        ];
        rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));
        organisationRepoMock.findByIds.mockResolvedValueOnce(new Map([[schule.id, schule]]));

        await expect(sut.isSatisfiedBy(pks)).resolves.toBe(false);
    });

    it('should return false, if a pk at a klasse has no matching schule', async () => {
        const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart: RollenArt.LERN });

        const klasse: Organisation<true> = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.KLASSE });

        const pks: Array<Personenkontext<true>> = [
            DoFactory.createPersonenkontext(true, { organisationId: klasse.id, rolleId: rolle.id }),
        ];
        rolleRepoMock.findByIds.mockResolvedValueOnce(new Map([[rolle.id, rolle]]));
        organisationRepoMock.findByIds.mockResolvedValueOnce(new Map([[klasse.id, klasse]]));

        await expect(sut.isSatisfiedBy(pks)).resolves.toBe(false);
    });
});
