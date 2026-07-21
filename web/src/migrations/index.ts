import * as migration_20260713_211902_initial from './20260713_211902_initial';
import * as migration_20260717_123832_ai_settings from './20260717_123832_ai_settings';
import * as migration_20260717_160000_attachments_events from './20260717_160000_attachments_events';
import * as migration_20260720_120000_editorial_workflow from './20260720_120000_editorial_workflow';
import * as migration_20260720_150000_summary_limitations_applications from './20260720_150000_summary_limitations_applications';
import * as migration_20260721_110000_summary_contributions_topics_metadata from './20260721_110000_summary_contributions_topics_metadata';
import * as migration_20260721_130000_member_contacts_identifiers from './20260721_130000_member_contacts_identifiers';
import * as migration_20260721_140000_member_toggle_column_names from './20260721_140000_member_toggle_column_names';

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
  {
    up: migration_20260720_120000_editorial_workflow.up,
    down: migration_20260720_120000_editorial_workflow.down,
    name: '20260720_120000_editorial_workflow'
  },
  {
    up: migration_20260720_150000_summary_limitations_applications.up,
    down: migration_20260720_150000_summary_limitations_applications.down,
    name: '20260720_150000_summary_limitations_applications'
  },
  {
    up: migration_20260721_110000_summary_contributions_topics_metadata.up,
    down: migration_20260721_110000_summary_contributions_topics_metadata.down,
    name: '20260721_110000_summary_contributions_topics_metadata'
  },
  {
    up: migration_20260721_130000_member_contacts_identifiers.up,
    down: migration_20260721_130000_member_contacts_identifiers.down,
    name: '20260721_130000_member_contacts_identifiers'
  },
  {
    up: migration_20260721_140000_member_toggle_column_names.up,
    down: migration_20260721_140000_member_toggle_column_names.down,
    name: '20260721_140000_member_toggle_column_names'
  },
];
