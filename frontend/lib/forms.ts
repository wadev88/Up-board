import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { getErrorMessage, isApiError } from "@/services/apiClient";

export interface ServerFieldErrorOptions {
  /** server field name (full or last segment) → form field name */
  aliases?: Record<string, string>;
  /** form field name → Thai message to show instead of the server's text */
  messages?: Record<string, string>;
}

/**
 * Push VALIDATION_ERROR / PROFANITY_DETECTED field details from the API onto
 * react-hook-form fields. Server field names may be dotted (`event.venue`,
 * `body.title`); we use the last segment and an optional alias map.
 * Returns true when at least one field error was applied.
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  known: readonly string[],
  aliases: Record<string, string> = {},
  messages: Record<string, string> = {},
): boolean {
  if (!isApiError(error)) return false;
  if (error.code !== "VALIDATION_ERROR" && error.code !== "PROFANITY_DETECTED") return false;
  const fieldErrors = error.fieldErrors();
  let applied = false;
  for (const [rawField, message] of Object.entries(fieldErrors)) {
    const last = rawField.split(".").pop() ?? rawField;
    const field = aliases[rawField] ?? aliases[last] ?? last;
    if (!known.includes(field)) continue;
    const text = error.code === "VALIDATION_ERROR" && messages[field] ? messages[field] : message;
    setError(field as Path<T>, { type: "server", message: text }, { shouldFocus: !applied });
    applied = true;
  }
  return applied;
}

/**
 * The one server-error pattern for forms: field errors (VALIDATION_ERROR /
 * PROFANITY_DETECTED details) are shown inline on their fields; anything else
 * becomes a toast. Returns true when the error was mapped onto fields.
 */
export function reportFormError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  known: readonly string[],
  { aliases, messages }: ServerFieldErrorOptions = {},
): boolean {
  const applied = applyServerFieldErrors(error, setError, known, aliases, messages);
  if (!applied) toast.error(getErrorMessage(error));
  return applied;
}
