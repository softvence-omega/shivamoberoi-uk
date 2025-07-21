import { Model } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { Migration } from '../migration.decorator';

@Migration()
@Injectable()
export class Migration001 {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async up() {
    const count = await this.userModel.countDocuments().exec();
    if (count === 0) {
      console.log('Initializing User collection with initial schema');
    }
  }

  async down() {
    await this.userModel.collection.drop();
    console.log('Dropped User collection');
  }
}