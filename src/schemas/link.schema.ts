import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LinkDocument = Link & Document;


@Schema()
export class Link{
    @Prop({ required: true})
    url: string;

    @Prop({required: true})
    sourceUrl: string;

    @Prop({required: true, enum: ['valid', 'broken', 'pending'], default: 'pending'})
    status: string;

    @Prop({required: true, default: Date.now})
    checkedAt: Date;

    @Prop({type: Number, default:0})
    httpStatus: number;
}

export const LinkSchema = SchemaFactory.createForClass(Link);