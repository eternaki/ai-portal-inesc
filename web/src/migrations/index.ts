import * as migration_20260713_211902_initial from './20260713_211902_initial';

export const migrations = [
  {
    up: migration_20260713_211902_initial.up,
    down: migration_20260713_211902_initial.down,
    name: '20260713_211902_initial'
  },
];
