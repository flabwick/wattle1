import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import "./InputField.css";

type InputFieldProps =
  | ({ multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
  | ({ multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>);

/** A single-line text input or multiline textarea, styled purely from tokens.css. */
export function InputField(props: InputFieldProps) {
  const { multiline, className, ...rest } = props;
  const classes = `input-field${multiline ? " input-field--multiline" : ""}${className ? ` ${className}` : ""}`;

  if (multiline) {
    return <textarea className={classes} {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)} />;
  }
  return <input className={classes} {...(rest as InputHTMLAttributes<HTMLInputElement>)} />;
}
