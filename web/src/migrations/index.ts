import * as migration_20260713_211902_initial from './20260713_211902_initial';
import * as migration_20260717_123832_ai_settings from './20260717_123832_ai_settings';

export const migrations = [
  {
    up: migration_20260713_211902_initial.up,
    down: migration_20260713_211902_initial.down,
    name: '20260713_211902_initial',
  },
  {
    up: migration_20260717_123832_ai_settings.up,
    down: migration_20260717_123832_ai_settings.down,
    name: '20260717_123832_ai_settings'
  },
];
