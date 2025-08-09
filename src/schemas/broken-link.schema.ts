// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document, Schema as MongooseSchema } from 'mongoose';

// export type BrokenLinkDocument = BrokenLink & Document;

// @Schema({ timestamps: true })
// export class BrokenLink {
//   @Prop({
//     required: true,
//     validate: {
//       validator: (url: string) => {
//         try {
//           new URL(url);
//           return true;
//         } catch {
//           return false;
//         }
//       },
//       message: (props: { value: string }) => `${props.value} is not a valid URL`,
//     },
//   })
//   url: string;

//   @Prop({
//     required: true,
//     validate: {
//       validator: (url: string) => {
//         try {
//           new URL(url);
//           return true;
//         } catch {
//           return false;
//         }
//       },
//       message: (props: { value: string }) => `${props.value} is not a valid base URL`,
//     },
//   })
//   baseUrl: string;

//   @Prop({ required: true, enum: ['internal', 'external'] })
//   linkType: string;

//   @Prop({ type: MongooseSchema.Types.Mixed, required: true })
//   status: number | string;

//   @Prop({
//     type: [String],
//     default: [],
//     validate: {
//       validator: (arr: string[]) => arr.length <= 100,
//       message: 'sourcePages cannot exceed 100 entries',
//     },
//   })
//   sourcePages: string[];

//   @Prop({ type: String, enum: ['Timeout', 'Connection Refused', 'DNS Resolution Failed', null], default: null })
//   reason?: string | null;

//   @Prop({ required: true })
//   checkedAt: Date;
// }

// export const BrokenLinkSchema = SchemaFactory.createForClass(BrokenLink);

// BrokenLinkSchema.index({ baseUrl: 1, status: 1 });
// BrokenLinkSchema.index({ checkedAt: -1 });

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