import { Controller, Headers, Get, UseFilters, Version } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOAuth2,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permissions } from '../../../authentication/api/permissions.decorator.js';
import { ClassLogger } from '../../../../core/logging/class-logger.js';
import { PersonInfoResponseV1 } from '../personinfo/v1/person-info.response.v1.js';
import { PersonenInfoService } from '../../domain/personeninfo/personeninfo.service.js';
import { ExceedsLimitError } from '../../../../shared/error/exceeds-limit.error.js';
import { ConfigService } from '@nestjs/config';
import { SchulconnexConfig } from '../../../../shared/config/schulconnex.config.js';
import { IPersonPermissions } from '../../../../shared/permissions/person-permissions.interface.js';
import { SchulConnexAuthenticationDomainErrorFilter } from '../../error/schulconnex-authentication-domain-error-filter.js';
import { SchulConnexSharedErrorFilter } from '../../error/schulconnex-shared-error-filter.js';
import { SchulConnexValidationErrorFilter } from '../../error/schulconnex-validation-error.filter.js';
import { DomainError } from '../../../../shared/error/domain.error.js';
import { PersonInfoDtoV2 } from '../personinfo/v2/person-info.response.v2.js';

@UseFilters(
    new SchulConnexSharedErrorFilter(),
    new SchulConnexAuthenticationDomainErrorFilter(),
    new SchulConnexValidationErrorFilter(),
)
@ApiBearerAuth()
@ApiOAuth2(['openid'])
@ApiTags('personen-info')
@Controller({ path: 'personen-info' })
export class PersonenInfoController {
    private readonly maxPersonenInfoLimit: number;

    public constructor(
        private readonly logger: ClassLogger,
        private readonly personInfoService: PersonenInfoService,
        private readonly configService: ConfigService,
    ) {
        this.logger.info(`Creating ${PersonenInfoController.name}`);
        this.maxPersonenInfoLimit = this.configService.getOrThrow<SchulconnexConfig>('SCHULCONNEX').LIMIT_PERSONENINFO;
    }

    @Get()
    @ApiOperation({
        summary: `liefert Personeninformationen basierend auf den Berechtigungen auf Service Provider des aufrufenden Nutzers.`,
        description: `liefert Personeninformationen basierend auf den Berechtigungen auf Service Provider des aufrufenden Nutzers.`,
        operationId: 'personenInfoControllerInfoV1',
    })
    @ApiQuery({
        name: 'x-limit',
        required: false,
        description: `Maximale Anzahl der Ergebnisse`,
        schema: { type: 'integer' },
    })
    @ApiQuery({
        name: 'x-offset',
        required: false,
        description: `Offset für die Ergebnisse`,
        schema: { type: 'integer' },
    })
    @ApiUnauthorizedResponse({ description: 'person is not logged in.' })
    @ApiOkResponse({ description: 'Liste von Personeninformationen', type: PersonInfoResponseV1 })
    public async infoV1(
        @Permissions() permissions: IPersonPermissions,
        @Headers('x-offset') offset: string,
        @Headers('x-limit') limit: string,
    ): Promise<PersonInfoResponseV1[]> {
        const parsedOffset: number = Number.isNaN(parseInt(offset, 10)) ? 0 : parseInt(offset, 10);
        const parsedLimit: number = Number.isNaN(parseInt(limit, 10)) ? this.maxPersonenInfoLimit : parseInt(limit, 10);

        if (parsedLimit > this.maxPersonenInfoLimit) {
            throw new ExceedsLimitError(`Limit darf maximal ${this.maxPersonenInfoLimit} sein.`);
        }

        const result: Result<PersonInfoResponseV1[], DomainError> =
            await this.personInfoService.findPersonsForPersonenInfoV1(permissions, parsedOffset, parsedLimit);
        if (!result.ok) {
            throw result.error;
        }
        return result.value;
    }

    @Version('2')
    @Get()
    @ApiOperation({
        summary: `liefert Personeninformationen basierend auf den Berechtigungen auf Service Provider des aufrufenden Nutzers mit internen Rollentypen.`,
        description: `liefert Personeninformationen basierend auf den Berechtigungen auf Service Provider des aufrufenden Nutzers mit internen Rollentypen.`,
        operationId: 'personenInfoControllerInfoV2',
    })
    @ApiQuery({
        name: 'x-limit',
        required: false,
        description: `Maximale Anzahl der Ergebnisse`,
        schema: { type: 'integer' },
    })
    @ApiQuery({
        name: 'x-offset',
        required: false,
        description: `Offset für die Ergebnisse`,
        schema: { type: 'integer' },
    })
    @ApiUnauthorizedResponse({ description: 'person is not logged in.' })
    @ApiOkResponse({ description: 'Liste von Personeninformationen', type: PersonInfoResponseV1 })
    public async infoV2(
        @Permissions() permissions: IPersonPermissions,
        @Headers('x-offset') offset: string,
        @Headers('x-limit') limit: string,
    ): Promise<PersonInfoDtoV2[]> {
        const parsedOffset: number = Number.isNaN(parseInt(offset, 10)) ? 0 : parseInt(offset, 10);
        const parsedLimit: number = Number.isNaN(parseInt(limit, 10)) ? this.maxPersonenInfoLimit : parseInt(limit, 10);

        if (parsedLimit > this.maxPersonenInfoLimit) {
            throw new ExceedsLimitError(`Limit darf maximal ${this.maxPersonenInfoLimit} sein.`);
        }

        const result: Result<PersonInfoDtoV2[], DomainError> =
            await this.personInfoService.findPersonsForPersonenInfoV2(permissions, parsedOffset, parsedLimit);
        if (!result.ok) {
            throw result.error;
        }
        return result.value;
    }
}
