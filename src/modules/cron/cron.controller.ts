import { Controller, Delete, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOAuth2,
    ApiOkResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { CronConfig } from '../../shared/config/cron.config.js';
import { DomainError } from '../../shared/error/domain.error.js';
import { EntityNotFoundError } from '../../shared/error/entity-not-found.error.js';
import { MissingPermissionsError } from '../../shared/error/missing-permissions.error.js';
import { PersonID } from '../../shared/types/aggregate-ids.types.js';
import { Permissions } from '../authentication/api/permissions.decorator.js';
import { EmailAddressDeletionService } from '../email/email-address-deletion/email-address-deletion.service.js';
import { KeycloakUserService } from '../keycloak-administration/domain/keycloak-user.service.js';
import { UserLock } from '../keycloak-administration/domain/user-lock.js';
import { UserLockRepository } from '../keycloak-administration/repository/user-lock.repository.js';
import { PersonLockOccasion } from '../person/domain/person.enums.js';
import { Person } from '../person/domain/person.js';
import { PersonRepository, PersonWithoutOrgDeleteListResult } from '../person/persistence/person.repository.js';
import { PersonDeleteService } from '../person/person-deletion/person-delete.service.js';
import { DbiamPersonenkontextBodyParams } from '../personenkontext/api/param/dbiam-personenkontext.body.params.js';
import { PersonenkontexteUpdateError } from '../personenkontext/domain/error/personenkontexte-update.error.js';
import { PersonenkontextWorkflowFactory } from '../personenkontext/domain/personenkontext-workflow.factory.js';
import { Personenkontext } from '../personenkontext/domain/personenkontext.js';
import { DBiamPersonenkontextRepo } from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { RollenSystemRecht } from '../rolle/domain/systemrecht.js';
import { IPersonPermissions } from '../../shared/permissions/person-permissions.interface.js';
import { VidisSyncService } from '../vidis/core/vidis.sync-service.js';

@Controller({ path: 'cron' })
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@ApiTags('cron')
export class CronController {
    private readonly config: CronConfig;

    public constructor(
        private readonly keyCloakUserService: KeycloakUserService,
        private readonly personRepository: PersonRepository,
        private readonly personDeleteService: PersonDeleteService,
        private readonly personenKonextRepository: DBiamPersonenkontextRepo,
        private readonly personenkontextWorkflowFactory: PersonenkontextWorkflowFactory,
        private readonly userLockRepository: UserLockRepository,
        private readonly emailAddressDeletionService: EmailAddressDeletionService,
        private readonly vidisSyncService: VidisSyncService,
        private readonly logger: ClassLogger,
        configService: ConfigService,
    ) {
        this.config = configService.getOrThrow<CronConfig>('CRON');
    }

    @Put('vidis-sync')
    @HttpCode(HttpStatus.OK)
    @ApiOkResponse({ description: 'VIDIS sync was successfully triggered.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to trigger VIDIS sync.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to trigger VIDIS sync.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while trying to trigger VIDIS sync.' })
    public async triggerVidisSync(@Permissions() permissions: IPersonPermissions): Promise<void> {
        try {
            const hasCronJobPermission: boolean = await permissions.hasSystemrechteAtRootOrganisation([
                RollenSystemRecht.CRON_DURCHFUEHREN,
            ]);
            if (!hasCronJobPermission) {
                throw new MissingPermissionsError('Cronrecht Required For This Endpoint');
            }

            void this.vidisSyncService.sync().catch((error: unknown) => {
                this.logger.logUnknownAsError('Could not complete VIDIS sync', error);
            });
        } catch (error) {
            this.logger.logUnknownAsError('Could not trigger VIDIS sync', error);
            throw new Error('Failed to trigger VIDIS sync due to an internal server error.');
        }
    }

    @Put('kopers-lock')
    @HttpCode(HttpStatus.OK)
    @ApiCreatedResponse({ description: 'User were successfully locked.', type: Boolean })
    @ApiBadRequestResponse({ description: 'User are not given or not found' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to lock user.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to lock user.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to lock user.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while trying to lock user.' })
    public async koPersUserLock(@Permissions() permissions: IPersonPermissions): Promise<boolean> {
        try {
            const hasCronJobPermission: boolean = await permissions.hasSystemrechteAtRootOrganisation([
                RollenSystemRecht.CRON_DURCHFUEHREN,
            ]);
            if (!hasCronJobPermission) {
                throw new MissingPermissionsError('Cronrecht Required For This Endpoint');
            }

            const personIdsTouple: [PersonID, string][] = await this.personRepository.getKoPersUserLockList();

            // Check if the array is empty (personIdsTouple === 0 is incorrect for array checks)
            if (personIdsTouple.length === 0) {
                return true;
            }

            const results: PromiseSettledResult<Result<void, DomainError>>[] = await Promise.allSettled(
                personIdsTouple.map(async ([personId, keycloakUserId]: [PersonID, string]) => {
                    const userLock: UserLock = UserLock.construct(
                        personId,
                        'Cron',
                        undefined,
                        PersonLockOccasion.KOPERS_GESPERRT,
                        new Date(),
                    );

                    const person: Option<Person<true>> = await this.personRepository.findById(personId);

                    const updateResult: Result<void, DomainError> =
                        await this.keyCloakUserService.updateKeycloakUserStatus(
                            personId,
                            keycloakUserId,
                            userLock,
                            true,
                        );
                    if (updateResult.ok) {
                        this.logger.info(
                            `System hat Benutzer ${person?.username} (${person?.id}) gesperrt, da nach Ablauf der Frist keine KoPers.-Nr. eingetragen war.`,
                        );
                    } else {
                        this.logger.error(
                            `System konnte Benutzer ${person?.username} (${person?.id}) nach Ablauf der Frist ohne KoPers.-Nr. nicht sperren. Fehler: ${updateResult.error.message}`,
                        );
                    }
                    return updateResult;
                }),
            );

            // Check if all operations were successful
            const allSuccessful: boolean = results.every(
                (result: PromiseSettledResult<Result<void, DomainError>>) =>
                    result.status === 'fulfilled' && result.value.ok === true,
            );

            if (allSuccessful) {
                this.logger.info(
                    `System hat alle Benutzer mit einer fehlenden KoPers.-Nr nach Ablauf der Frist gesperrt.`,
                );
            } else {
                this.logger.error(
                    `System konnte nicht alle Benutzer mit einer fehlenden KoPers.-Nr nach Ablauf der Frist sperren.`,
                );
            }

            return allSuccessful;
        } catch (error) {
            this.logger.logUnknownAsError('Could not lock users', error);
            throw new Error('Failed to lock users due to an internal server error.');
        }
    }

    @Put('kontext-expired')
    @HttpCode(HttpStatus.OK)
    @ApiCreatedResponse({ description: 'Personenkontexte were successfully removed from users.', type: Boolean })
    @ApiBadRequestResponse({ description: 'Personenkontexte are not given or not found.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to remove personenkontexte from users.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to remove personenkontexte from users.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to remove personenkontexte from users.' })
    @ApiInternalServerErrorResponse({
        description: 'Internal server error while trying to remove personenkontexte from users.',
    })
    public async removePersonenKontexteWithExpiredBefristungFromUsers(
        @Permissions() permissions: IPersonPermissions,
    ): Promise<boolean> {
        try {
            const hasCronJobPermission: boolean = await permissions.hasSystemrechteAtRootOrganisation([
                RollenSystemRecht.CRON_DURCHFUEHREN,
            ]);
            if (!hasCronJobPermission) {
                throw new MissingPermissionsError('Cronrecht Required For This Endpoint');
            }
            //Get PersonenKontexte for a person at least one kontext exceeds the befristung value
            const personenKontexteGroupedByPersonId: Map<PersonID, Personenkontext<true>[]> =
                await this.personenKonextRepository.getPersonenKontexteWithExpiredBefristung();
            if (personenKontexteGroupedByPersonId.size === 0) {
                return true;
            }

            // Filter each Personenkontext and validate Personenkontexte to keep for each person
            const promises: Promise<Personenkontext<true>[] | PersonenkontexteUpdateError>[] = [];
            personenKontexteGroupedByPersonId.forEach(
                (personenKontexte: Personenkontext<true>[], personId: PersonID) => {
                    const count: number = personenKontexte.length;

                    // Filter PersonenKontexte
                    const [personenKontexteToKeep, personenkontexteToDelete]: [
                        DbiamPersonenkontextBodyParams[],
                        DbiamPersonenkontextBodyParams[],
                    ] = this.filterPersonenKontexte(personenKontexte);

                    const pkToDeleteMessage: string = personenkontexteToDelete
                        .map(
                            (pk: DbiamPersonenkontextBodyParams) =>
                                `(orgaId:${pk.organisationId}, rolleId:${pk.rolleId}, befristung:${pk.befristung?.toISOString()})`,
                        )
                        .join(', ');

                    // Validate PersonenKontexte to keep
                    promises.push(
                        (async (): Promise<Personenkontext<true>[] | PersonenkontexteUpdateError> => {
                            const person: Option<Person<true>> = await this.personRepository.findById(personId);

                            const result: Personenkontext<true>[] | PersonenkontexteUpdateError =
                                await this.personenkontextWorkflowFactory
                                    .createNew()
                                    .commit(personId, new Date(), count, personenKontexteToKeep, permissions);
                            if (result instanceof PersonenkontexteUpdateError) {
                                this.logger.error(
                                    `System konnte die befristete(n) Schulzuordnung(en) des Benutzers ${person?.username} (${person?.id}) nicht aufheben. Abgelaufende Schulzuordnung(en): [${pkToDeleteMessage}]. Fehler: ${result.message}`,
                                );
                            } else {
                                this.logger.info(
                                    `System hat die befristete(n) Schulzuordnung(en) des Benutzers ${person?.username} (${person?.id}) aufgehoben. Abgelaufende Schulzuordnung(en): [${pkToDeleteMessage}].`,
                                );
                            }
                            return result;
                        })(),
                    );
                },
            );

            // Validate results
            const results: PromiseSettledResult<Personenkontext<true>[] | PersonenkontexteUpdateError>[] =
                await Promise.allSettled(promises);

            const allSuccessful: boolean = results.every(
                (result: PromiseSettledResult<Personenkontext<true>[] | PersonenkontexteUpdateError>) =>
                    result.status === 'fulfilled' && !(result.value instanceof PersonenkontexteUpdateError),
            );

            if (allSuccessful) {
                this.logger.info(`System hat alle abgelaufenen Schulzuordnungen entfernt.`);
            } else {
                this.logger.error(`System konnte nicht alle abgelaufenen Schulzuordnungen entfernen.`);
            }

            return allSuccessful;
        } catch (error) {
            this.logger.logUnknownAsError('Could not remove personenkontexte', error);
            throw new Error('Failed to remove kontexte due to an internal server error.');
        }
    }

    private filterPersonenKontexte(
        personenKontexte: Personenkontext<true>[],
    ): [toKeep: DbiamPersonenkontextBodyParams[], toDelete: DbiamPersonenkontextBodyParams[]] {
        const today: Date = new Date();
        today.setHours(0, 0, 0, 0);
        const personenKontexteToKeep: DbiamPersonenkontextBodyParams[] = [];
        const personenKontexteToDelete: DbiamPersonenkontextBodyParams[] = [];
        personenKontexte.forEach((personenKontext: Personenkontext<true>) => {
            if (!personenKontext.befristung || personenKontext.befristung >= today) {
                personenKontexteToKeep.push({
                    personId: personenKontext.personId,
                    organisationId: personenKontext.organisationId,
                    rolleId: personenKontext.rolleId,
                    befristung: personenKontext.befristung,
                });
            } else {
                personenKontexteToDelete.push({
                    personId: personenKontext.personId,
                    organisationId: personenKontext.organisationId,
                    rolleId: personenKontext.rolleId,
                    befristung: personenKontext.befristung,
                });
            }
        });
        return [personenKontexteToKeep, personenKontexteToDelete];
    }

    @Put('person-without-org')
    @HttpCode(HttpStatus.OK)
    @ApiCreatedResponse({ description: 'Users were successfully removed.', type: Boolean })
    @ApiBadRequestResponse({ description: 'Users are not given or not found' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to remove users.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to delete users.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to delete users.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while trying to remove users.' })
    public async personWithoutOrgDelete(@Permissions() permissions: IPersonPermissions): Promise<boolean> {
        try {
            const hasCronJobPermission: boolean = await permissions.hasSystemrechteAtRootOrganisation([
                RollenSystemRecht.CRON_DURCHFUEHREN,
            ]);
            if (!hasCronJobPermission) {
                throw new MissingPermissionsError('Cronrecht Required For This Endpoint');
            }

            const { ids: personIds, total }: PersonWithoutOrgDeleteListResult =
                await this.personRepository.getPersonWithoutOrgDeleteList(this.config.PERSON_WITHOUT_ORG_LIMIT);
            const toDeleteCount: number = personIds.length;
            if (toDeleteCount === 0) {
                return true;
            }

            this.logger.info(
                `Es wurden ${total} Benutzer gefunden, die seit 90 Tagen oder mehr ohne Schulzuordnung sind. Zur vollständigen Bereinigung sind ${Math.ceil(total / this.config.PERSON_WITHOUT_ORG_LIMIT)} Durchläufe notwendig.`,
            );

            const results: PromiseSettledResult<Result<void, DomainError>>[] = await Promise.allSettled(
                personIds.map(async (id: string) => {
                    const person: Option<Person<true>> = await this.personRepository.findById(id);
                    const deleteResult: Result<void, DomainError> =
                        await this.personDeleteService.deletePersonAfterDeadlineExceeded(id, permissions);
                    if (deleteResult.ok) {
                        this.logger.info(
                            `System hat ${person?.username} (${person?.id}) nach 90 Tagen ohne Schulzuordnung gelöscht.`,
                        );
                    } else {
                        this.logger.error(
                            `System konnte Benutzer ${person?.username} (${person?.id}) nach 90 Tagen ohne Schulzuordnung nicht löschen. Fehler: ${deleteResult.error.message}`,
                        );
                    }
                    return deleteResult;
                }),
            );

            const allSuccessful: boolean = results.every(
                (result: PromiseSettledResult<Result<void, DomainError>>) =>
                    result.status === 'fulfilled' && result.value.ok === true,
            );

            if (allSuccessful) {
                this.logger.info(
                    `System hat ${toDeleteCount} Benutzer mit einer fehlenden Schulzuordnung nach 90 Tagen gelöscht.`,
                );
            } else {
                this.logger.error(
                    `System konnte nicht alle ${toDeleteCount} Benutzer mit einer fehlenden Schulzuordnung nach 90 Tagen löschen.`,
                );
            }

            return allSuccessful;
        } catch (error) {
            this.logger.logUnknownAsError('Could not remove users', error);
            throw new Error('Failed to remove users due to an internal server error.');
        }
    }

    @Put('unlock')
    @ApiOkResponse({
        description: 'The users were successfully unlocked.',
        type: Boolean,
    })
    @ApiUnauthorizedResponse({ description: 'Not authorized to unlock users.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to unlock users.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to unlock users.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while trying to unlock users.' })
    public async unlockUsersWithExpiredLocks(@Permissions() permissions: IPersonPermissions): Promise<boolean> {
        try {
            const hasCronJobPermission: boolean = await permissions.hasSystemrechteAtRootOrganisation([
                RollenSystemRecht.CRON_DURCHFUEHREN,
            ]);
            if (!hasCronJobPermission) {
                throw new MissingPermissionsError('Cronrecht Required For This Endpoint');
            }
            const userLocks: UserLock[] = await this.userLockRepository.getLocksToUnlock();
            if (userLocks.length === 0) {
                return true;
            }

            const results: PromiseSettledResult<Result<void, DomainError>>[] = await Promise.allSettled(
                userLocks.map(async (userLock: UserLock) => {
                    const person: Result<Person<true>> = await this.personRepository.getPersonIfAllowed(
                        userLock.person,
                        permissions,
                    );

                    if (!person.ok || !person.value.keycloakUserId) {
                        return { ok: false, error: new EntityNotFoundError() };
                    }
                    const updateResult: Result<void, DomainError> =
                        await this.keyCloakUserService.updateKeycloakUserStatus(
                            person.value.id,
                            person.value.keycloakUserId,
                            userLock,
                            false,
                        );
                    if (updateResult.ok) {
                        this.logger.info(
                            `System hat die befristete Sperre von Benutzer ${person.value.username} (${person.value.id}) aufgehoben.`,
                        );
                    } else {
                        this.logger.error(
                            `System konnte befristete Sperre von Benutzer ${person.value.username} (${person.value.id}) nicht aufheben. Fehler: ${updateResult.error.message}`,
                        );
                    }
                    return updateResult;
                }),
            );

            const allSuccessful: boolean = results.every(
                (result: PromiseSettledResult<Result<void, DomainError>>) =>
                    result.status === 'fulfilled' && result.value.ok === true,
            );

            if (allSuccessful) {
                this.logger.info(
                    `System hat die befristete Sperre von allen gesperrten Benutzern mit abgelaufener Befristung aufgehoben.`,
                );
            } else {
                this.logger.error(
                    `System hat die befristete Sperre nicht von allen gesperrten Benutzern mit abgelaufener Befristung aufgehoben.`,
                );
            }
            return allSuccessful;
        } catch (error) {
            this.logger.logUnknownAsError('Could not unlock users', error);
            throw new Error('Failed to unlock users due to an internal server error.');
        }
    }

    @Delete('email-addresses-delete')
    @HttpCode(HttpStatus.OK)
    @ApiCreatedResponse({ description: 'EmailAddresses were successfully removed.', type: Boolean })
    @ApiBadRequestResponse({ description: 'EmailAddresses not found.' })
    @ApiUnauthorizedResponse({ description: 'Not authorized to delete EmailAddresses.' })
    @ApiForbiddenResponse({ description: 'Insufficient permissions to delete EmailAddresses.' })
    @ApiNotFoundResponse({ description: 'Insufficient permissions to delete EmailAddresses.' })
    @ApiInternalServerErrorResponse({ description: 'Internal server error while trying to delete EmailAddresses.' })
    public async emailAddressesDelete(@Permissions() permissions: IPersonPermissions): Promise<void> {
        try {
            const hasCronJobPermission: boolean = await permissions.hasSystemrechteAtRootOrganisation([
                RollenSystemRecht.CRON_DURCHFUEHREN,
            ]);
            if (!hasCronJobPermission) {
                throw new MissingPermissionsError('Cronrecht Required For This Endpoint');
            }

            const { processed, total }: { processed: number; total: number } =
                await this.emailAddressDeletionService.deleteEmailAddresses(
                    permissions,
                    this.config.EMAIL_ADDRESSES_DELETE_LIMIT,
                );
            this.logger.info(
                `Es wurden ${processed}/${total} Email-Adressen zur Löschung markiert. Zur vollständigen Bereinigung sind ${Math.ceil(total / this.config.EMAIL_ADDRESSES_DELETE_LIMIT)} Durchläufe notwendig.`,
            );

            return;
        } catch (error) {
            throw error;
        }
    }
}
