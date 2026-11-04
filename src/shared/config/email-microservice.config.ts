import { IsNotEmpty, IsString } from 'class-validator';

export class EmailMicroserviceConfig {
    @IsString()
    @IsNotEmpty()
    public readonly ENDPOINT!: string;
}
