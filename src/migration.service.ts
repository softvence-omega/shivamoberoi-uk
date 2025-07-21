import { Injectable, Inject } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { MIGRATION } from './migration.decorator';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Migration, MigrationDocument } from './schemas/migrations.schema';
import { Model } from 'mongoose';

@Injectable()
export class MigrationService {
   constructor(
    private discoveryService: DiscoveryService,
    private reflector: Reflector,
    private configService: ConfigService,
    @Inject('MIGRATION_PROVIDERS') private migrationProviders: any[],
    @InjectModel(Migration.name) private migrationModel: Model<MigrationDocument>,
  ) {}

  async runMigrations() {
    const migrations = this.discoveryService
      .getProviders()
      .filter((wrapper: InstanceWrapper) => wrapper?.metatype && this.reflector.get<boolean>(MIGRATION, wrapper.metatype))
      .map((wrapper) => wrapper.instance);

    const appliedMigrations = new Set((await this.migrationModel.find().exec()).map(m => m.name));
    for (const migration of migrations.sort((a, b) => {
      const aName = a.constructor.name.match(/\d+/)[0];
      const bName = b.constructor.name.match(/\d+/)[0];
      return parseInt(aName) - parseInt(bName);
    })) {
      const migrationName = migration.constructor.name;
      if (!appliedMigrations.has(migrationName)) {
        console.log(`Applying migration: ${migrationName}`);
        await migration.up();
        await this.migrationModel.create({ name: migrationName, appliedAt: new Date() });
        console.log(`Migration ${migrationName} applied successfully`);
      } else {
        console.log(`Migration ${migrationName} already applied, skipping`);
      }
    }
  } 
}