/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { waitFor } from '../../test-utils/async.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ApiAuthDialog } from './ApiAuthDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { clearApiKey, AuthType } from '@google/gemini-cli-core';
import type { LoadedSettings, MergedSettings } from '../../config/settings.js';

// Mocks
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    clearApiKey: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/text-buffer.js', () => ({
  useTextBuffer: vi.fn(),
}));

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    terminalWidth: 80,
  })),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedUseTextBuffer = useTextBuffer as Mock;

// Mock helpers
const createMockSettings = (): LoadedSettings =>
  ({
    system: {
      settings: {},
      originalSettings: {},
    },
    systemDefaults: {
      settings: {},
      originalSettings: {},
    },
    user: {
      settings: {},
      originalSettings: {},
    },
    workspace: {
      settings: {},
      originalSettings: {},
    },
    isTrusted: true,
    errors: [],
    merged: {
      security: {
        auth: {
          selectedType: AuthType.USE_GEMINI,
          apiKey: '',
          baseUrl: '',
        },
      },
      model: {
        name: '',
      },
    } as MergedSettings,
    forScope: vi.fn(),
    setValue: vi.fn(),
    setRemoteAdminSettings: vi.fn(),
  }) as unknown as LoadedSettings;

describe('ApiAuthDialog', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const setAuthState = vi.fn();
  const setAuthContext = vi.fn();
  const mockSettings = createMockSettings();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_API_KEY', '');
    mockBuffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn((newText) => {
        mockBuffer.text = newText;
        mockBuffer.viewportVisualLines = [newText];
      }),
    } as unknown as TextBuffer;
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders correctly', () => {
    const { lastFrame } = render(
      <ApiAuthDialog
        settings={mockSettings}
        onSubmit={onSubmit}
        onCancel={onCancel}
        setAuthState={setAuthState}
        setAuthContext={setAuthContext}
      />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with a defaultValue', () => {
    render(
      <ApiAuthDialog
        settings={mockSettings}
        onSubmit={onSubmit}
        onCancel={onCancel}
        setAuthState={setAuthState}
        setAuthContext={setAuthContext}
        defaultValue="test-key"
      />,
    );
    expect(mockedUseTextBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        initialText: 'test-key',
        viewport: expect.objectContaining({
          height: 4,
        }),
      }),
    );
  });

  it.each([
    {
      keyName: 'return',
      sequence: '\r',
      expectedCall: onSubmit,
      args: ['submitted-key'],
    },
    { keyName: 'escape', sequence: '\u001b', expectedCall: onCancel, args: [] },
  ])(
    'calls $expectedCall.name when $keyName is pressed',
    ({ keyName, sequence, expectedCall, args }) => {
      mockBuffer.text = 'submitted-key'; // Set for the onSubmit case
      render(
        <ApiAuthDialog
          settings={mockSettings}
          onSubmit={onSubmit}
          onCancel={onCancel}
          setAuthState={setAuthState}
          setAuthContext={setAuthContext}
        />,
      );
      // calls[0] is the ApiAuthDialog's useKeypress (Ctrl+C handler)
      // calls[1] is the TextInput's useKeypress (typing handler)
      const keypressHandler = mockedUseKeypress.mock.calls[1][0];

      keypressHandler({
        name: keyName,
        shift: false,
        ctrl: false,
        cmd: false,
        sequence,
      });

      expect(expectedCall).toHaveBeenCalledWith(...args);
    },
  );

  it('displays an error message', () => {
    const { lastFrame } = render(
      <ApiAuthDialog
        settings={mockSettings}
        onSubmit={onSubmit}
        onCancel={onCancel}
        setAuthState={setAuthState}
        setAuthContext={setAuthContext}
        error="Invalid API Key"
      />,
    );

    expect(lastFrame()).toContain('Invalid API Key');
  });

  it('calls clearApiKey and clears buffer when Ctrl+C is pressed', async () => {
    render(
      <ApiAuthDialog
        settings={mockSettings}
        onSubmit={onSubmit}
        onCancel={onCancel}
        setAuthState={setAuthState}
        setAuthContext={setAuthContext}
      />,
    );
    // Call 0 is ApiAuthDialog (isActive: true)
    // Call 1 is TextInput (isActive: true, priority: true)
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    keypressHandler({
      name: 'c',
      shift: false,
      ctrl: true,
      cmd: false,
    });

    await waitFor(() => {
      expect(clearApiKey).toHaveBeenCalled();
      expect(mockBuffer.setText).toHaveBeenCalledWith('');
    });
  });
});
