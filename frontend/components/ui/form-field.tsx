import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

type ControlAriaProps = {
  id?: string;
  "aria-required"?: boolean | "true" | "false";
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
};

/**
 * Label + control + hint + error.
 *
 * When the direct child is the control (its `id` equals the field `id`), the
 * field wires `aria-required`, `aria-invalid` and `aria-describedby`
 * (error → hint) onto it automatically. Props set explicitly on the control win.
 */
export function FormField({ id, label, error, hint, required, className, children }: FormFieldProps) {
  const control = wireControl(children, id, { error, hint, required });
  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {control}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function wireControl(
  children: React.ReactNode,
  id: string,
  { error, hint, required }: { error?: string; hint?: React.ReactNode; required?: boolean },
): React.ReactNode {
  if (!React.isValidElement<ControlAriaProps>(children) || children.props.id !== id) return children;
  const props = children.props;
  const extra: ControlAriaProps = {};
  if (required && props["aria-required"] === undefined) extra["aria-required"] = true;
  if (error && props["aria-invalid"] === undefined) extra["aria-invalid"] = true;
  if (props["aria-describedby"] === undefined) {
    const describedBy = fieldDescribedBy(id, error, hint);
    if (describedBy) extra["aria-describedby"] = describedBy;
  }
  return Object.keys(extra).length ? React.cloneElement(children, extra) : children;
}

export function fieldDescribedBy(id: string, error?: string, hint?: React.ReactNode) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
