

import { IsString, IsUrl, IsInt, Min, Max } from 'class-validator';


export class CrawlBrokenLinkDto {
    @IsUrl()
    url: string;

    @IsInt()
    @Min(1)
    @Max(5)
    maxDepth: number = 2;
}


export class GetBrokenLinkDto {
    
    @IsUrl()
    url: string;

    @IsInt()
    @Min(1)
    page: number=1;
}