/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { clearApiKey, debugLogger, AuthType } from '@google/gemini-cli-core';
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

// Gemini API Key 表单
function GeminiApiKeyForm({
  apiKeyBuffer,
  onSubmit,
  onCancel,
}: {
  apiKeyBuffer: ReturnType<typeof useTextBuffer>;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>
          Please enter your Gemini API key. It will be securely stored in your
          system keychain.
        </Text>
        <Text color={theme.text.secondary}>
          You can get an API key from{' '}
          <Text color={theme.text.link}>
            https://aistudio.google.com/app/apikey
          </Text>
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
            buffer={apiKeyBuffer}
            onSubmit={onSubmit}
            onCancel={onCancel}
            placeholder="Paste your API key here"
          />
        </Box>
      </Box>
    </>
  );
}

// Third-party API Form with multi-field support
function ThirdPartyApiForm({
  apiKeyBuffer,
  baseUrlBuffer,
  modelBuffer,
  focusedField,
  onFocusChange,
  onSubmit,
  onCancel,
  settings,
}: {
  apiKeyBuffer: ReturnType<typeof useTextBuffer>;
  baseUrlBuffer: ReturnType<typeof useTextBuffer>;
  modelBuffer: ReturnType<typeof useTextBuffer>;
  focusedField: 'apiKey' | 'baseUrl' | 'model';
  onFocusChange: (field: 'apiKey' | 'baseUrl' | 'model') => void;
  onSubmit: () => void;
  onCancel: () => void;
  settings: LoadedSettings;
}): React.JSX.Element {
  // Handle Tab to switch focus
  useKeypress(
    (key) => {
      if (key.name === 'tab') {
        const fieldOrder: Array<'apiKey' | 'baseUrl' | 'model'> = [
          'apiKey',
          'baseUrl',
          'model',
        ];
        const currentIndex = fieldOrder.indexOf(focusedField);
        const nextIndex = (currentIndex + 1) % fieldOrder.length;
        onFocusChange(fieldOrder[nextIndex]);
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  return (
    <>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>
          Please enter your {settings.merged.security.auth.selectedType} API
          key, base URL, and model. They will be securely stored in your system
          keychain.
        </Text>
        <Text color={theme.text.secondary}>
          You can get an API key from{' '}
          <Text color={theme.text.link}>your LLM provider&apos;s website</Text>
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={
            focusedField === 'apiKey'
              ? theme.border.focused
              : theme.border.default
          }
          paddingX={1}
          flexGrow={1}
        >
          <TextInput
            buffer={apiKeyBuffer}
            onSubmit={onSubmit}
            onCancel={onCancel}
            placeholder="Paste your API key here"
            focus={focusedField === 'apiKey'}
          />
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={
            focusedField === 'baseUrl'
              ? theme.border.focused
              : theme.border.default
          }
          paddingX={1}
          flexGrow={1}
        >
          <TextInput
            buffer={baseUrlBuffer}
            onSubmit={onSubmit}
            onCancel={onCancel}
            placeholder="Enter base URL (e.g., https://api.openai.com/v1)"
            focus={focusedField === 'baseUrl'}
          />
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={
            focusedField === 'model'
              ? theme.border.focused
              : theme.border.default
          }
          paddingX={1}
          flexGrow={1}
        >
          <TextInput
            buffer={modelBuffer}
            onSubmit={onSubmit}
            onCancel={onCancel}
            placeholder="Enter model (e.g., gpt-4)"
            focus={focusedField === 'model'}
          />
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Tab to switch between fields)
        </Text>
      </Box>
    </>
  );
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

  const apiKeyBuffer = useTextBuffer({
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

  const initialBaseUrl = settings.merged.security.auth.baseUrl || '';

  const baseUrlBuffer = useTextBuffer({
    initialText: initialBaseUrl,
    initialCursorOffset: initialBaseUrl.length,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const initialModel = settings.merged.model.name || '';

  const modelBuffer = useTextBuffer({
    initialText: initialModel,
    initialCursorOffset: initialModel.length,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false,
    inputFilter: (text) => text.replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const isGemini =
    settings.merged.security.auth.selectedType === AuthType.USE_GEMINI;

  // Track which field is focused for third-party form
  const [focusedField, setFocusedField] = useState<
    'apiKey' | 'baseUrl' | 'model'
  >('apiKey');

  const handleGeminiSubmit = useCallback(
    (value: string) => {
      onSubmit(value);
    },
    [onSubmit],
  );

  const handleThirdPartySubmit = useCallback(() => {
    settings.setValue(
      SettingScope.User,
      'security.auth.apiKey',
      apiKeyBuffer.text,
    );
    settings.setValue(
      SettingScope.User,
      'security.auth.baseUrl',
      baseUrlBuffer.text,
    );
    settings.setValue(SettingScope.User, 'model.name', modelBuffer.text);
    setAuthContext({ requiresRestart: true });
    setAuthState(AuthState.Unauthenticated);
  }, [
    settings,
    apiKeyBuffer,
    baseUrlBuffer,
    modelBuffer,
    setAuthContext,
    setAuthState,
  ]);

  const handleClear = useCallback(() => {
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
        apiKeyBuffer.setText('');
        baseUrlBuffer.setText('');
        modelBuffer.setText('');
      })
      .catch((err) => {
        debugLogger.debug('Failed to clear API key:', err);
      });
  }, [apiKeyBuffer, baseUrlBuffer, modelBuffer]);

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
      {isGemini ? (
        <GeminiApiKeyForm
          apiKeyBuffer={apiKeyBuffer}
          onSubmit={handleGeminiSubmit}
          onCancel={onCancel}
        />
      ) : (
        <ThirdPartyApiForm
          apiKeyBuffer={apiKeyBuffer}
          baseUrlBuffer={baseUrlBuffer}
          modelBuffer={modelBuffer}
          focusedField={focusedField}
          onFocusChange={setFocusedField}
          onSubmit={handleThirdPartySubmit}
          onCancel={onCancel}
          settings={settings}
        />
      )}
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
