import { Organisation } from '../../modules/organisation/domain/organisation.js';
import { Rolle } from '../../modules/rolle/domain/rolle.js';
import { RollenArt } from '../../modules/rolle/domain/rolle.enums.js';
import { DomainError } from '../error/domain.error.js';
import { OrganisationRepository } from '../../modules/organisation/persistence/organisation.repository.js';
import { RolleRepo } from '../../modules/rolle/repo/rolle.repo.js';

export interface FindAllowedRollenOptions {
    organisationId: string | undefined;
    permissionsCheck: () => Promise<boolean>;
    organisationRepository: OrganisationRepository;
    rolleRepo: RolleRepo;
    checkReferences: (orgId: string, rolleId: string) => Promise<Result<void, DomainError>>;
    rolleName?: string;
    rollenIds?: string[];
    limit?: number;
    allowedRollenArten?: RollenArt[];
}

export async function findAllowedRollen({
    organisationId,
    permissionsCheck,
    organisationRepository,
    rolleRepo,
    checkReferences,
    rolleName,
    rollenIds,
    limit,
    allowedRollenArten,
}: FindAllowedRollenOptions): Promise<Rolle<true>[]> {
    if (!organisationId || !(await permissionsCheck())) {
        return [];
    }

    const organisation: Option<Organisation<true>> = await organisationRepository.findById(organisationId);
    if (!organisation) {
        return [];
    }

    const rollen: Rolle<true>[] = rolleName
        ? await rolleRepo.findByName(rolleName, false, undefined, undefined, allowedRollenArten)
        : await rolleRepo.findByRollenArten(false, undefined, undefined, allowedRollenArten);

    const allowedRollen: Rolle<true>[] = (
        await Promise.all(
            rollen.map(async (rolle: Rolle<true>) => {
                const result: Result<void, DomainError> = await checkReferences(organisation.id, rolle.id);
                return result.ok ? rolle : null;
            }),
        )
    ).filter((rolle: Rolle<true> | null): rolle is Rolle<true> => rolle !== null);

    let selectedRollen: Rolle<true>[] = [];
    if (rollenIds?.length) {
        selectedRollen = Array.from((await rolleRepo.findByIds(rollenIds)).values());
    }

    const allRollenMap: Map<string, Rolle<true>> = new Map<string, Rolle<true>>();
    [...allowedRollen, ...selectedRollen].forEach((rolle: Rolle<true>) => {
        allRollenMap.set(rolle.id, rolle);
    });

    let finalRollen: Rolle<true>[] = Array.from(allRollenMap.values()).sort((a: Rolle<true>, b: Rolle<true>) =>
        a.name.localeCompare(b.name, 'de', { numeric: true }),
    );

    if (limit) {
        const selectedIds: Set<string> = new Set(rollenIds);
        const guaranteedSelected: Rolle<true>[] = finalRollen.filter((r: Rolle<true>) => selectedIds.has(r.id));
        const otherRollen: Rolle<true>[] = finalRollen
            .filter((r: Rolle<true>) => !selectedIds.has(r.id))
            .slice(0, Math.max(limit - guaranteedSelected.length, 0));
        finalRollen = [...guaranteedSelected, ...otherRollen];
    }

    return finalRollen;
}
