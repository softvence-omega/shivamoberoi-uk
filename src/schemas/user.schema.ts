import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { IsOptional } from 'class-validator';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({
    type: Types.ObjectId,
    default: () => new Types.ObjectId(),
    _id: true,
  })
  _id: Types.ObjectId;

  @Prop({ required: true, unique: true})
  username: string;

  // @Prop()
  // @IsOptional()
  // name: string;

  @Prop({ required: true })
  password: string;
  
  @Prop({ default: null })
  lastLogin: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
