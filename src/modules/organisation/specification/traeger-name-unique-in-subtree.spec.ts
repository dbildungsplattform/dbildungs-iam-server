import { createMock, type DeepMocked } from '../../../../test/utils/createMock.js';
import { DoFactory } from '../../../../test/utils/index.js';
import { OrganisationsTyp } from '../domain/organisation.enums.js';
import { type Organisation } from '../domain/organisation.js';
import { OrganisationRepository } from '../persistence/organisation.repository.js';
import { TraegerNameUniqueInSubtree } from './traeger-name-unique-in-subtree.js';
import { faker } from '@faker-js/faker';

type SubtreeType = 'oeffentlich' | 'ersatz';

describe('TraegerNameUniqueInSubtree Specification', () => {
    let sut: TraegerNameUniqueInSubtree<true, false>;
    let orgaRepoMock: DeepMocked<OrganisationRepository>;
    beforeEach(() => {
        orgaRepoMock = createMock(OrganisationRepository);
        sut = new TraegerNameUniqueInSubtree(orgaRepoMock);
    });

    it('when object is not of type traeger, it should return true', async () => {
        const nonTraeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.SCHULE,
        });
        await expect(sut.isSatisfiedBy(nonTraeger)).resolves.toBe(true);
    });

    it('when traeger has no name, it should return false', async () => {
        const traegerWithoutName: Organisation<true, false> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.TRAEGER,
            name: undefined,
        });
        await expect(sut.isSatisfiedBy(traegerWithoutName)).resolves.toBe(false);
    });

    type RootNode = 'ROOT' | 'OEFFENTLICH' | 'ERSATZ';
    it.each<RootNode[]>([['ROOT'], ['OEFFENTLICH'], ['ERSATZ']])(
        'when traeger has the same name as %s, it should return false',
        async (duplicateNodeType: RootNode) => {
            const root: Organisation<true, false> = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.ROOT,
            });
            const oeffentlich: Organisation<true, false> = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.LAND,
            });
            const ersatz: Organisation<true, false> = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.LAND,
            });
            orgaRepoMock.findById.mockResolvedValueOnce(root);
            orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([oeffentlich, ersatz]);
            const traeger: Organisation<true, false> = DoFactory.createOrganisationAggregate(true, {
                typ: OrganisationsTyp.TRAEGER,
            });
            switch (duplicateNodeType) {
                case 'ROOT':
                    traeger.name = root.name;
                    break;
                case 'OEFFENTLICH':
                    traeger.name = oeffentlich.name;
                    break;
                case 'ERSATZ':
                    traeger.name = ersatz.name;
                    break;
            }

            await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(false);
        },
    );

    it('when ersatz has the same name as traeger, it should return false', async () => {
        const ersatz: Organisation<true, false> = DoFactory.createOrganisationAggregate(true, {
            typ: OrganisationsTyp.LAND,
        });
        const traeger: Organisation<true, false> = DoFactory.createOrganisationAggregate(true, {
            typ: OrganisationsTyp.TRAEGER,
            name: ersatz.name,
        });
        orgaRepoMock.findById.mockResolvedValueOnce(undefined);
        orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([undefined, ersatz]);
        await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(false);
    });

    it('when no traeger with same name exists, it should return true', async () => {
        const traeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.TRAEGER,
        });
        orgaRepoMock.findBy.mockResolvedValueOnce([[], 0]);
        orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([undefined, undefined]);
        await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(true);
    });

    it('when only traeger itself has the name, it should return true', async () => {
        const traeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
            typ: OrganisationsTyp.TRAEGER,
        });
        orgaRepoMock.findBy.mockResolvedValueOnce([[traeger], 1]);
        orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([undefined, undefined]);
        await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(true);
    });

    describe.each<SubtreeType[]>([['oeffentlich'], ['ersatz']])(
        'when looking at %s subtree',
        (subtreeType: SubtreeType) => {
            let root: Organisation<true, false>;
            let parent: Organisation<true, false>;
            beforeEach(() => {
                root = DoFactory.createOrganisation(true, { typ: OrganisationsTyp.ROOT });
                parent = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.LAND,
                    administriertVon: root.id,
                    zugehoerigZu: root.id,
                });
                orgaRepoMock.findById.mockResolvedValueOnce(root);
                if (subtreeType === 'oeffentlich') {
                    orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([parent, undefined]);
                } else {
                    orgaRepoMock.findRootDirectChildren.mockResolvedValueOnce([undefined, parent]);
                }
            });

            describe.each([['direct'], ['indirect']])('when traeger is %s child of subtreeRoot', (label: string) => {
                let traeger: Organisation<true, false>;
                beforeEach(() => {
                    traeger = DoFactory.createOrganisation(true, {
                        typ: OrganisationsTyp.TRAEGER,
                        zugehoerigZu: label === 'direct' ? parent.id : faker.string.uuid(),
                    });
                    if (label === 'indirect') {
                        orgaRepoMock.isOrgaAParentOfOrgaB.mockResolvedValueOnce(true);
                    }
                });

                it.each([
                    ['unique', true],
                    ['not unique', false],
                ])('when name is %s in subtree, it should return %s', async (_label: string, expected: boolean) => {
                    orgaRepoMock.findBy.mockResolvedValueOnce([
                        [
                            traeger,
                            DoFactory.createOrganisation(true, { name: traeger.name, typ: OrganisationsTyp.TRAEGER }),
                        ],
                        1,
                    ]);
                    orgaRepoMock.isOrgaAParentOfOrgaB.mockResolvedValueOnce(!expected);
                    await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(expected);
                });
            });

            it('when traeger is not part of the subtree, it should return true', async () => {
                const traeger: Organisation<true, false> = DoFactory.createOrganisation(true, {
                    typ: OrganisationsTyp.TRAEGER,
                    zugehoerigZu: '',
                });
                orgaRepoMock.findBy.mockResolvedValueOnce([
                    [
                        traeger,
                        DoFactory.createOrganisation(true, {
                            name: traeger.name,
                            typ: OrganisationsTyp.TRAEGER,
                            administriertVon: parent.id,
                            zugehoerigZu: parent.id,
                        }),
                    ],
                    2,
                ]);
                await expect(sut.isSatisfiedBy(traeger)).resolves.toBe(true);
            });
        },
    );
});
