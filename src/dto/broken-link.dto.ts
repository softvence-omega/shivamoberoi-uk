import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CrawlBrokenLinksDto {
  @ApiProperty({ description: 'The base URL to crawl for broken links' })
  @IsString()
  url: string;

  @ApiProperty({ description: 'Maximum crawl depth', default: 2 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  maxDepth: number = 2;
}

export class GetBrokenLinksDto {
  @ApiProperty({ description: 'The base URL to retrieve broken links for' })
  @IsString()
  url: string;

  @ApiProperty({ description: 'Page number for pagination', default: 1 })
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ description: 'Number of items per page', default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}