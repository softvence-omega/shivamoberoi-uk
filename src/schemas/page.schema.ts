import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose'

export type PageDocument = Page & Document

@Schema()
export class Page {
    @Prop({
        required: true, unique: true
    })
    url: string;

    @Prop({
        required: true
    })
    content: string;

    @Prop({
        type: [String], default: []
    })
    linkedUrls: string[];

    @Prop({required: true, default: Date.now})
    imageUrls: string[];

    @Prop({required: true, default: Date.now})
    crawledAt: Date;
}

export const PageSchema = SchemaFactory.createForClass(Page);