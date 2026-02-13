/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { clearApiKey, debugLogger , AuthType } from '@google/gemini-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import type { LoadedSettings } from '../../config/settings.js';
import { SettingScope } from '../../config/settings.js';
import { AuthState } from '../types.js';

interface ApiAuthDialogProps {
  settings: LoadedSettings;
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
  setAuthState: (state: AuthState) => void;
  setAuthContext: (context: { requiresRestart?: boolean }) => void;
  error?: string | null;
  defaultValue?: string;
}

export function ApiAuthDialog({
  settings,
  onSubmit,
  onCancel,
  setAuthState,
  setAuthContext,
  error,
  defaultValue = '',
}: ApiAuthDialogProps): React.JSX.Element {
  const { terminalWidth } = useUIState();
  const viewportWidth = terminalWidth - 8;

  const pendingPromise = useRef<{ cancel: () => void } | null>(null);

  useEffect(
    () => () => {
      pendingPromise.current?.cancel();
    },
    [],
  );

  const initialApiKey = defaultValue;

  const buffer = useTextBuffer({
    initialText: initialApiKey || '',
    initialCursorOffset: initialApiKey?.length || 0,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false, // No path validation needed for API key
    inputFilter: (text) =>
      text.replace(/[^a-zA-Z0-9_.-]/g, '').replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const handleSubmit = (value: string) => {
    if (settings.merged.security.auth.selectedType === AuthType.USE_GEMINI) {
      onSubmit(value);
    } else {
      settings.setValue(SettingScope.User, 'security.auth.apiKey', value);
      setAuthContext({ requiresRestart: true });
      setAuthState(AuthState.Unauthenticated);
    }
  };

  const handleClear = () => {
    pendingPromise.current?.cancel();

    let isCancelled = false;
    const wrappedPromise = new Promise<void>((resolve, reject) => {
      clearApiKey().then(
        () => !isCancelled && resolve(),
        (error) => !isCancelled && reject(error),
      );
    });

    pendingPromise.current = {
      cancel: () => {
        isCancelled = true;
      },
    };

    return wrappedPromise
      .then(() => {
        buffer.setText('');
      })
      .catch((err) => {
        debugLogger.debug('Failed to clear API key:', err);
      });
  };

  useKeypress(
    (key) => {
      if (keyMatchers[Command.CLEAR_INPUT](key)) {
        void handleClear();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        Enter {settings.merged.security.auth.selectedType} Key
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>
          Please enter your {settings.merged.security.auth.selectedType} API
          key. It will be securely stored in your system keychain.
        </Text>
        <Text color={theme.text.secondary}>
          You can get an API key from{' '}
          {settings.merged.security.auth.selectedType ===
          AuthType.USE_GEMINI ? (
            <Text color={theme.text.link}>
              https://aistudio.google.com/app/apikey
            </Text>
          ) : (
            <Text color={theme.text.link}>
              your LLM provider&apos;s website
            </Text>
          )}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
          flexGrow={1}
        >
          <TextInput
            buffer={buffer}
            onSubmit={handleSubmit}
            onCancel={onCancel}
            placeholder="Paste your API key here"
          />
        </Box>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Enter to submit, Esc to cancel, Ctrl+C to clear stored key)
        </Text>
      </Box>
    </Box>
  );
}
