import { Body, Controller, HttpCode, Post, UseGuards, UseInterceptors, Version } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExternalDataCacheInterceptor } from '../../../shared/cache/external-data-cache-interceptor.js';
import { DomainError } from '../../../shared/error/index.js';
import { UserExternalData, UserExternaldataService } from '../domain/user-externaldata.service.js';
import { AccessApiKeyGuard } from './access.apikey.guard.js';
import { UserExternalDataV2BodyParams } from './externaldata/user-externaldata-v2.body.params.js';
import { UserExternalDataV2Response } from './externaldata/user-externaldata-v2.response.js';
import { Public } from './public.decorator.js';

@ApiTags('Keycloakinternal')
@ApiHeader({ name: 'api-key', description: 'Internal API key for server-to-server communication', required: true })
@Controller({ path: 'keycloakinternal' })
export class KeycloakInternalController {
    public constructor(private readonly userExternaldataService: UserExternaldataService) {}

    @UseInterceptors(ExternalDataCacheInterceptor)
    @Version('2')
    @Post('externaldata')
    @HttpCode(200)
    @Public()
    @UseGuards(AccessApiKeyGuard)
    @ApiOperation({ summary: 'External Data about the requested user, scoped to a single Angebot.' })
    @ApiOkResponse({
        description: 'Returns external Data about the requested user for the given Angebot.',
        type: UserExternalDataV2Response,
    })
    public async getExternalDataV2(@Body() params: UserExternalDataV2BodyParams): Promise<UserExternalDataV2Response> {
        const result: Result<UserExternalData, DomainError> = await this.userExternaldataService.getExternalData(
            params.sub,
            params.keycloakClientId,
            params.includeEmailAddress ?? false,
        );
        if (!result.ok) {
            throw result.error;
        }

        return UserExternalDataV2Response.createNew(result.value);
    }
}
