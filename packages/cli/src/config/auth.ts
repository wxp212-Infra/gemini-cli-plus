/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { loadEnvironment, loadSettings } from './settings.js';

export function validateAuthMethod(_authMethod: string): string | null {
  loadEnvironment(loadSettings().merged, process.cwd());

  return null;

  //return 'Invalid auth method selected.';
}
