import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type BrokenLinkDocument = BrokenLink & Document;

@Schema({ timestamps: true })
export class BrokenLink {
  @Prop({ required: true })
  url: string;

  @Prop({ required: true })
  baseUrl: string;

  @Prop({ required: true, enum: ['internal', 'external'] })
  linkType: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  status: number | string;

  @Prop({ type: [String], default: [] })
  sourcePages: string[];

  @Prop()
  reason?: string;

  @Prop({ required: true })
  checkedAt: Date;
}

export const BrokenLinkSchema = SchemaFactory.createForClass(BrokenLink);

BrokenLinkSchema.index({ baseUrl: 1, status: 1 });