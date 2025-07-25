import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalysisDocument = Analysis & Document;

@Schema()
export class Analysis {
    @Prop({required: true})
    url: string;

    @Prop({ required: true})
    name: string

    @Prop({type: [String], default: []})
    brokenLinks: string[];

    @Prop({type: [String], default: []})
    oversizedImages: string[];

    @Prop({type: [String], default:[]})
    blurryImage: string[];

    @Prop({required: true, default: Date.now})
    analyzedAt: Date;

}

export const AnalysisSchema = SchemaFactory.createForClass(Analysis);