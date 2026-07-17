import * as migration_20260713_211902_initial from './20260713_211902_initial';
import * as migration_20260717_123832_ai_settings from './20260717_123832_ai_settings';
import * as migration_20260717_160000_attachments_events from './20260717_160000_attachments_events';

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
  {
    up: migration_20260717_160000_attachments_events.up,
    down: migration_20260717_160000_attachments_events.down,
    name: '20260717_160000_attachments_events'
  },
];
