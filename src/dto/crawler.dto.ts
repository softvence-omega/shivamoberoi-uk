import { IsString, IsUrl, IsOptional } from 'class-validator';

export class StartCrawlingDto {
  @IsUrl({}, { message: 'Invalid URL format' })
  @IsString()
  url: string;
}

export class GetIndexDto {
  @IsUrl({}, { message: 'Invalid URL format' })
  @IsString()
  url: string;
}