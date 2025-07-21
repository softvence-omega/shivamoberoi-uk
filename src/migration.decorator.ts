import { SetMetadata } from '@nestjs/common';

export const MIGRATION = 'isMigration';
export const Migration = () => SetMetadata(MIGRATION, true);