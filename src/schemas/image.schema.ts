import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ImageDocument = Image & Document;


@Schema()
export class Image {
    @Prop({required: true})
    url: string;

    @Prop({required: true})
    sourceUrl: string;

    @Prop({required: true})
    fileSize: number;

    @Prop({required: true})
    width: number;

    @Prop({required: true})
    height: number;

    @Prop({required: true,default: false})
    isBlurry: boolean;

    @Prop({required: true, default: Date.now})
    analyzedAt: Date;

}

export const ImageSchema = SchemaFactory.createForClass(Image);
