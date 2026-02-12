/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Config,
  type FallbackModelHandler,
  type FallbackIntent,
  type ValidationHandler,
  type ValidationIntent,
  type UserTierId,
} from '@google/gemini-cli-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type UseHistoryManagerReturn } from './useHistoryManager.js';
import { MessageType } from '../types.js';
import {
  type ProQuotaDialogRequest,
  type ValidationDialogRequest,
} from '../contexts/UIStateContext.js';

interface UseQuotaAndFallbackArgs {
  config: Config;
  historyManager: UseHistoryManagerReturn;
  userTier: UserTierId | undefined;
  setModelSwitchedFromQuotaError: (value: boolean) => void;
  onShowAuthSelection: () => void;
}

export function useQuotaAndFallback({
  config,
  historyManager,
  userTier,
  setModelSwitchedFromQuotaError,
  onShowAuthSelection,
}: UseQuotaAndFallbackArgs) {
  const [proQuotaRequest, setProQuotaRequest] =
    useState<ProQuotaDialogRequest | null>(null);
  const [validationRequest, setValidationRequest] =
    useState<ValidationDialogRequest | null>(null);
  const isDialogPending = useRef(false);
  const isValidationPending = useRef(false);

  // Set up Flash fallback handler
  useEffect(() => {
    const fallbackHandler: FallbackModelHandler = async (
      _failedModel,
      _fallbackModel,
      _error,
    ): Promise<FallbackIntent | null> => 
      // Fallbacks are currently only handled for OAuth users.
       null
    ;

    config.setFallbackModelHandler(fallbackHandler);
  }, [config, historyManager, userTier, setModelSwitchedFromQuotaError]);

  // Set up validation handler for 403 VALIDATION_REQUIRED errors
  useEffect(() => {
    const validationHandler: ValidationHandler = async (
      validationLink,
      validationDescription,
      learnMoreUrl,
    ): Promise<ValidationIntent> => {
      if (isValidationPending.current) {
        return 'cancel'; // A validation dialog is already active
      }
      isValidationPending.current = true;

      const intent: ValidationIntent = await new Promise<ValidationIntent>(
        (resolve) => {
          // Call setValidationRequest directly - same pattern as proQuotaRequest
          setValidationRequest({
            validationLink,
            validationDescription,
            learnMoreUrl,
            resolve,
          });
        },
      );

      return intent;
    };

    config.setValidationHandler(validationHandler);
  }, [config]);

  const handleProQuotaChoice = useCallback(
    (choice: FallbackIntent) => {
      if (!proQuotaRequest) return;

      const intent: FallbackIntent = choice;
      proQuotaRequest.resolve(intent);
      setProQuotaRequest(null);
      isDialogPending.current = false; // Reset the flag here

      if (choice === 'retry_always' || choice === 'retry_once') {
        // Reset quota error flags to allow the agent loop to continue.
        setModelSwitchedFromQuotaError(false);
        config.setQuotaErrorOccurred(false);

        if (choice === 'retry_always') {
          historyManager.addItem(
            {
              type: MessageType.INFO,
              text: `Switched to fallback model ${proQuotaRequest.fallbackModel}`,
            },
            Date.now(),
          );
        }
      }
    },
    [proQuotaRequest, historyManager, config, setModelSwitchedFromQuotaError],
  );

  const handleValidationChoice = useCallback(
    (choice: ValidationIntent) => {
      // Guard against double-execution (e.g. rapid clicks) and stale requests
      if (!isValidationPending.current || !validationRequest) return;

      // Immediately clear the flag to prevent any subsequent calls from passing the guard
      isValidationPending.current = false;

      validationRequest.resolve(choice);
      setValidationRequest(null);

      if (choice === 'change_auth' || choice === 'cancel') {
        onShowAuthSelection();
      }
    },
    [validationRequest, onShowAuthSelection],
  );

  return {
    proQuotaRequest,
    handleProQuotaChoice,
    validationRequest,
    handleValidationChoice,
  };
}
