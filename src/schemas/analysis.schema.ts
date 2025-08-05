import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnalysisDocument = Analysis & Document;

@Schema()
export class Analysis {
    @Prop({required: true})
    url: string;

    @Prop()
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

// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document } from 'mongoose';

// export type AnalysisDocument = Analysis & Document;

// @Schema({ timestamps: true })
// export class Analysis {
//   @Prop({ required: true })
//   name: string;

//   @Prop({ required: true })
//   url: string;

//   @Prop({
//     type: {
//       internalLinks: Number,
//       externalLinks: Number,
//       brokenLinks: Number,
//     },
//     required: true,
//   })
//   websiteLink: {
//     internalLinks: number;
//     externalLinks: number;
//     brokenLinks: number;
//   };

//   @Prop()
//   oversizedImages: number;

//   @Prop()
//   blurryImages: number;

//   @Prop()
//   analyzedAt: Date;
// }

// export const AnalysisSchema = SchemaFactory.createForClass(Analysis);

// // import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// // import { Document } from 'mongoose';

// // export type AnalysisDocument = Analysis & Document;

// // @Schema()
// // export class Analysis {
// //     @Prop({required: true})
// //     url: string;

// //     @Prop()
// //     name: string

// //     @Prop({type: [String], default: []})
// //     brokenLinks: string[];

// //     @Prop({type: [String], default: []})
// //     oversizedImages: string[];

// //     @Prop({type: [String], default:[]})
// //     blurryImage: string[];

// //     @Prop({required: true, default: Date.now})
// //     analyzedAt: Date;

// // }

// // export const AnalysisSchema = SchemaFactory.createForClass(Analysis);