import { Inject, Injectable, Scope } from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';
import { DBiamPersonenkontextRepo } from '../personenkontext/persistence/dbiam-personenkontext.repo.js';
import {
    EscalatedPermissionAtOrga,
    EscalatedPersonPermissions,
    isEscalatedPersonPermissions,
} from './escalated-person-permissions.js';
import { OrganisationRepository } from '../organisation/persistence/organisation.repository.js';
import { PersonID } from '../../shared/types/index.js';
import { ClassLogger } from '../../core/logging/class-logger.js';
import { isPersonPermissions } from '../authentication/domain/person-permissions.js';
import { IPersonPermissions } from '../../shared/permissions/person-permissions.interface.js';
import { NotPersonPermissionError } from './error/not-person-permission.error.js';

@Injectable({ scope: Scope.TRANSIENT })
export class EscalatedPersonPermissionsFactory {
    public constructor(
        private readonly organisationRepo: OrganisationRepository,
        private readonly personenkontextRepo: DBiamPersonenkontextRepo,
        private readonly logger: ClassLogger,

        @Inject(INQUIRER) private readonly parentClass: object,
    ) {}

    public createNew(
        escalatedPermissions: Array<EscalatedPermissionAtOrga>,
        escalatedForPersonId?: PersonID,
    ): EscalatedPersonPermissions {
        const escalator: {
            name: string;
        } = {
            name: escalatedForPersonId ?? this.parentClass?.constructor?.name,
        };

        return EscalatedPersonPermissions.createNew(
            escalator,
            escalatedPermissions,
            this.organisationRepo,
            this.personenkontextRepo,
            this.logger,
        );
    }

    public async fromPermissions(
        permissions: IPersonPermissions,
        escalatedPermissions: Array<EscalatedPermissionAtOrga>,
    ): Promise<EscalatedPersonPermissions> {
        if (isEscalatedPersonPermissions(permissions)) {
            permissions.extendEscalation(escalatedPermissions);
            return permissions;
        } else if (isPersonPermissions(permissions)) {
            return await EscalatedPersonPermissions.fromPersonPermissions(
                permissions,
                escalatedPermissions,
                this.organisationRepo,
                this.personenkontextRepo,
                this.logger,
            );
        } else {
            throw new NotPersonPermissionError();
        }
    }
}
