import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';


export type ContentDocument = Content & Document;

@Schema()

export class Content {
    @Prop({ required: true})
    url: string;

    @Prop({required: true})
    originalContent: string;

    @Prop({required: true})
    generatedContent: string;

    @Prop({ type: Object, default:{}})
    analysis: {
        readabilityScore: number;
        keywordDensity: number;
        issues: string[];
    };

    @Prop({required: true, default: Date.now})
    createdAt: Date;

    @Prop({required: true, default: Date.now})
    updatedAt: Date;
}

export const ContentSchema = SchemaFactory.createForClass(Content);