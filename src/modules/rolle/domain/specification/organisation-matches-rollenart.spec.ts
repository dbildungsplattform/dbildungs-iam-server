import { DoFactory } from '../../../../../test/utils/do-factory.js';
import { OrganisationsTyp } from '../../../organisation/domain/organisation.enums.js';
import { Organisation } from '../../../organisation/domain/organisation.js';
import { RollenArt } from '../rolle.enums.js';
import { Rolle } from '../rolle.js';
import { OrganisationMatchesRollenart } from './organisation-matches-rollenart.js';

describe('OrganisationMatchesRollenart specification', () => {
    const sut: OrganisationMatchesRollenart = new OrganisationMatchesRollenart();
    const allRollenarten: RollenArt[] = Object.values(RollenArt);

    describe.each([
        [
            OrganisationsTyp.ROOT,
            [RollenArt.SYSADMIN],
            allRollenarten.filter((ra: RollenArt) => ra !== RollenArt.SYSADMIN),
        ],
        [
            OrganisationsTyp.LAND,
            [RollenArt.SYSADMIN],
            allRollenarten.filter((ra: RollenArt) => ra !== RollenArt.SYSADMIN),
        ],
        [OrganisationsTyp.TRAEGER, allRollenarten, []],
        [
            OrganisationsTyp.SCHULE,
            [RollenArt.LEIT, RollenArt.LEHR, RollenArt.LERN],
            [RollenArt.SYSADMIN, RollenArt.ORGADMIN],
        ],
        [OrganisationsTyp.KLASSE, [RollenArt.LERN], allRollenarten.filter((ra: RollenArt) => ra !== RollenArt.LERN)],
        [OrganisationsTyp.ANBIETER, allRollenarten, []],
        [OrganisationsTyp.SONSTIGE, allRollenarten, []],
        [OrganisationsTyp.UNBEST, allRollenarten, []],
    ])(
        'when organisation is of type %s',
        (organisationsTyp: OrganisationsTyp, allowedRollenarten: RollenArt[], disallowedRollenarten: RollenArt[]) => {
            it('should be satisfied for allowed rollenarten', () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, { typ: organisationsTyp });
                allowedRollenarten.forEach((rollenart: RollenArt) => {
                    const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart });
                    const result: boolean = sut.isSatisfiedBy(organisation, rolle);
                    expect(result).toBe(true);
                });
            });

            it('should not be satisfied for disallowed rollenarten', () => {
                const organisation: Organisation<true> = DoFactory.createOrganisation(true, { typ: organisationsTyp });
                disallowedRollenarten.forEach((rollenart: RollenArt) => {
                    const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart });
                    const result: boolean = sut.isSatisfiedBy(organisation, rolle);
                    expect(result).toBe(false);
                });
            });
        },
    );

    describe('when organisation has no type', () => {
        it('should not be satisfied for any rollenart', () => {
            const organisation: Organisation<true> = DoFactory.createOrganisation(true, { typ: undefined });
            Object.values(RollenArt).forEach((rollenart: RollenArt) => {
                const rolle: Rolle<true> = DoFactory.createRolle(true, { rollenart });
                const result: boolean = sut.isSatisfiedBy(organisation, rolle);
                expect(result).toBe(false);
            });
        });
    });
});
