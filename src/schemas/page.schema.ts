import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PageDocument = Page & Document;

@Schema()
export class Page {
  @Prop({ required: true, unique: true })
  url: string;

  @Prop({ required: true })
  content: string;

  @Prop({ type: [String], default: [] })
  linkedUrls: string[];

  @Prop({ type: [String], default: [] })
  imageUrls: string[];

  @Prop({ type: [{ name: String, content: String }], default: [] })
  metaTags: { name: string; content: string }[];

  @Prop({ type: [String], default: [] })
  headings: string[];

  @Prop([String])
  keywords: string[];

  @Prop({ required: true })
  loadTime: number;

  @Prop({ required: true, default: Date.now })
  crawledAt: Date;
}

export const PageSchema = SchemaFactory.createForClass(Page);
