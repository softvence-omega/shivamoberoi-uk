import { Module } from "@nestjs/common";
import { MongooseModule, Schema } from '@nestjs/mongoose';
import { ImageSchema } from "src/schemas/image.schema";
import { Link, LinkSchema } from "src/schemas/link.schema";
import {Page, PageSchema } from "src/schemas/page.schema";
import { CrawlerController } from "./crawler.controller";
import { CrawlerService } from "./crawler.service";



@Module({
    imports: [
        MongooseModule.forFeature([

            {name:Page.name, schema: PageSchema},
            {name:Link.name, schema: LinkSchema},
            {name: Image.name, schema: ImageSchema},

        ]),
    ],
    controllers: [CrawlerController],
    providers: [CrawlerService],
    exports: [CrawlerService],
})
export class CrawlerModule {}