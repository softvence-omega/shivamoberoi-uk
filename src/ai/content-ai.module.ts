import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MongooseModule } from "@nestjs/mongoose";
import { Mongoose } from "mongoose";
import {Content,  ContentSchema } from "src/schemas/content.schema";
import { ContentAiService } from "./content-ai.service";


@Module({
    imports: [
        MongooseModule.forFeature([{name: Content.name, schema:ContentSchema}]),
        ConfigModule,
    ],

    providers: [ContentAiService],
    exports: [ContentAiService]
})
export class ContentAiModule {}