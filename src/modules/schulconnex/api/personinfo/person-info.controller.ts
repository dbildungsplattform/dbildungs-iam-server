import { Controller, Get, UseFilters, Version } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { EntityNotFoundError } from '../../../../shared/error/index.js';
import { Permissions } from '../../../authentication/api/permissions.decorator.js';
import { Person } from '../../../person/domain/person.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import {
    DBiamPersonenkontextRepo,
    KontextWithOrgaAndRolle,
} from '../../../personenkontext/persistence/dbiam-personenkontext.repo.js';
import { PersonRepository } from '../../../person/persistence/person.repository.js';
import { PersonEmailResponse } from '../../../person/api/person-email-response.js';
import { PersonInfoResponseV1 } from './v1/person-info.response.v1.js';
import { UserLockRepository } from '../../../keycloak-administration/repository/user-lock.repository.js';
import { UserLock } from '../../../keycloak-administration/domain/user-lock.js';
import { PersonInfoResponse } from './v0/person-info.response.js';
import { EmailResolverService } from '../../../email-microservice/domain/email-resolver.service.js';
import { EmailRepo } from '../../../email/persistence/email.repo.js';
import { IPersonPermissions } from '../../../../shared/permissions/person-permissions.interface.js';
import { SchulConnexSharedErrorFilter } from '../../error/schulconnex-shared-error-filter.js';
import { SchulConnexAuthenticationDomainErrorFilter } from '../../error/schulconnex-authentication-domain-error-filter.js';
import { SchulConnexValidationErrorFilter } from '../../error/schulconnex-validation-error.filter.js';
import { SchulconnexMapperService } from '../../domain/schulconnex-mapper.service.js';
import { PersonInfoDtoV2 } from './v2/person-info.response.v2.js';

@UseFilters(
    new SchulConnexSharedErrorFilter(),
    new SchulConnexAuthenticationDomainErrorFilter(),
    new SchulConnexValidationErrorFilter(),
)
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@ApiTags('person-info')
@Controller({ path: 'person-info' })
export class PersonInfoController {
    public constructor(
        private readonly logger: ClassLogger,
        private readonly personRepo: PersonRepository,
        private readonly dBiamPersonenkontextRepo: DBiamPersonenkontextRepo,
        private readonly userLockRepo: UserLockRepository,
        private readonly emailRepo: EmailRepo,
        private readonly emailResolverService: EmailResolverService,
        private readonly schulconnexMapper: SchulconnexMapperService,
    ) {
        this.logger.info(`Creating ${PersonInfoController.name}`);
    }

    @Get()
    @ApiOperation({ summary: 'Info about logged in person.' })
    @ApiUnauthorizedResponse({ description: 'person is not logged in.' })
    @ApiOkResponse({ description: 'Returns info about the person.', type: PersonInfoResponse })
    public async info(@Permissions() permissions: IPersonPermissions): Promise<PersonInfoResponse> {
        const personId: string = permissions.personFields.id;
        const person: Option<Person<true>> = await this.personRepo.findById(personId);

        if (!person) {
            throw new EntityNotFoundError(Person.name, personId);
        }

        let personEmailResponse: Option<PersonEmailResponse>;
        if (this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Getting PersonEmailResponse for PersonId ${personId} using new Microservice`);
            personEmailResponse = await this.emailResolverService.findEmailBySpshPerson(personId);
        } else {
            this.logger.info(`Getting PersonEmailResponse for PersonId ${personId} using old emailRepo`);
            personEmailResponse = await this.emailRepo.getEmailAddressAndStatusForPerson(person);
        }

        const kontexteWithOrgaAndRolle: Array<KontextWithOrgaAndRolle> = await Promise.resolve(
            this.dBiamPersonenkontextRepo.findByPersonWithOrgaAndRolle(personId),
        );

        return PersonInfoResponse.createNew(person, kontexteWithOrgaAndRolle, personEmailResponse);
    }

    @Version('1')
    @Get()
    @ApiOperation({ summary: 'Info about logged in person.', operationId: 'personInfoControllerInfoV1' })
    @ApiUnauthorizedResponse({ description: 'person is not logged in.' })
    @ApiOkResponse({ description: 'Returns info about the person.', type: PersonInfoResponseV1 })
    public async infoV1(@Permissions() permissions: IPersonPermissions): Promise<PersonInfoResponseV1> {
        const personId: string = permissions.personFields.id;
        const person: Option<Person<true>> = await this.personRepo.findById(personId);

        if (!person) {
            throw new EntityNotFoundError(Person.name, personId);
        }

        let personEmailResponse: Option<PersonEmailResponse>;
        if (this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Getting PersonEmailResponse for PersonId ${personId} using new Microservice`);
            personEmailResponse = await this.emailResolverService.findEmailBySpshPerson(personId);
        } else {
            this.logger.info(`Getting PersonEmailResponse for PersonId ${personId} using old emailRepo`);
            personEmailResponse = await this.emailRepo.getEmailAddressAndStatusForPerson(person);
        }

        const [kontexteWithOrgaAndRolle, userLocks]: [Array<KontextWithOrgaAndRolle>, UserLock[]] = await Promise.all([
            this.dBiamPersonenkontextRepo.findByPersonWithOrgaAndRolle(personId),
            this.userLockRepo.findByPersonId(personId),
        ]);

        return PersonInfoResponseV1.createNew(person, kontexteWithOrgaAndRolle, personEmailResponse, userLocks);
    }

    @Version('2')
    @Get()
    @ApiOperation({
        summary: 'Info about logged in person with intern role types.',
        operationId: 'personInfoControllerInfoV2',
    })
    @ApiUnauthorizedResponse({ description: 'person is not logged in.' })
    @ApiOkResponse({ description: 'Returns info about the person.', type: PersonInfoDtoV2 })
    public async infoV2(@Permissions() permissions: IPersonPermissions): Promise<PersonInfoDtoV2> {
        const personId: string = permissions.personFields.id;
        const person: Option<Person<true>> = await this.personRepo.findById(personId);

        if (!person) {
            throw new EntityNotFoundError(Person.name, personId);
        }

        let personEmailResponse: Option<PersonEmailResponse>;
        if (this.emailResolverService.shouldUseEmailMicroservice()) {
            this.logger.info(`Getting PersonEmailResponse for PersonId ${personId} using new Microservice`);
            personEmailResponse = await this.emailResolverService.findEmailBySpshPerson(personId);
        } else {
            this.logger.info(`Getting PersonEmailResponse for PersonId ${personId} using old emailRepo`);
            personEmailResponse = await this.emailRepo.getEmailAddressAndStatusForPerson(person);
        }

        const [kontexteWithOrgaAndRolle, userLocks]: [Array<KontextWithOrgaAndRolle>, UserLock[]] = await Promise.all([
            this.dBiamPersonenkontextRepo.findByPersonWithOrgaAndRolle(personId),
            this.userLockRepo.findByPersonId(personId),
        ]);

        return this.schulconnexMapper.mapPersonInfo(person, kontexteWithOrgaAndRolle, personEmailResponse, userLocks);
    }
}
