import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WidgetConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  botName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  welcomeMessage?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WidgetConfigDto)
  widgetConfig?: WidgetConfigDto;
}
