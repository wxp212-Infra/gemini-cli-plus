/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';

export async function handleFallback(
  _config: Config,
  _failedModel: string,
  _authType?: string,
  _error?: unknown,
): Promise<string | boolean | null> {
  /* if (authType !== AuthType.LOGIN_WITH_GOOGLE) {
    return null;
  } */
  return null;
}
