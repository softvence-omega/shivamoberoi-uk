import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MigrationDocument = Migration & Document;

@Schema()
export class Migration {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true, default: Date.now })
  appliedAt: Date;
}

export const MigrationSchema = SchemaFactory.createForClass(Migration);