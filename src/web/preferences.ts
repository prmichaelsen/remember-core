// src/web/preferences.ts
// Preferences use cases — wraps PreferencesDatabaseService with Result<T, E>

import type { UserPreferences } from '../types/preferences.types.js';
import type { WebSDKContext } from './context.js';
import type { WebSDKError } from './errors.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import { internal, validation } from './errors.js';

export async function getPreferences(
  ctx: WebSDKContext,
): Promise<Result<UserPreferences>> {
  if (!ctx.preferencesService) {
    return err(validation('PreferencesDatabaseService not available in context'));
  }
  try {
    const prefs = await ctx.preferencesService.getPreferences(ctx.userId);
    return ok(prefs);
  } catch (e) {
    return err(wrapError(e));
  }
}

export async function updatePreferences(
  ctx: WebSDKContext,
  input: Partial<UserPreferences>,
): Promise<Result<UserPreferences>> {
  if (!ctx.preferencesService) {
    return err(validation('PreferencesDatabaseService not available in context'));
  }
  try {
    const prefs = await ctx.preferencesService.updatePreferences(ctx.userId, input);
    return ok(prefs);
  } catch (e) {
    return err(wrapError(e));
  }
}

function wrapError(e: unknown): WebSDKError {
  const message = e instanceof Error ? e.message : String(e);
  return internal(message);
}
