import { IsArray, IsString, IsUrl } from "class-validator";



export class AnalyzeSeoDto {
    @IsUrl({}, { message: "Imvalid URL format"})
    @IsString()
    url: string;

}


    export class GenerateContentDto {
        @IsUrl({}, { message: "Invalid URL format" })
        @IsString()
        url: string;

        @IsArray()
        @IsString({each:true})
        keyword: string[];

        @IsString()
        generatedContent: string;
    }

    export class RefineContentDto {
        @IsUrl({}, { message: "Invalid URL format" })
        @IsString()
        url: string;

        @IsString()
        content: string;
    }