import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BrokenLinkDocument = BrokenLink & Document;

@Schema()
export class BrokenLink {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  baseUrl: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  status: number | string;

  @Prop()
  sourcePage: string;

  @Prop()
  checkedAt: Date;
}

export const BrokenLinkSchema = SchemaFactory.createForClass(BrokenLink);

BrokenLinkSchema.index({ baseUrl: 1, status: 1 });