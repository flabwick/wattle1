import { forwardRef } from "react";
import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from "react";
import "./InputField.css";

type InputFieldProps =
  | ({ multiline?: false } & InputHTMLAttributes<HTMLInputElement>)
  | ({ multiline: true } & TextareaHTMLAttributes<HTMLTextAreaElement>);

/** A single-line text input or multiline textarea, styled purely from tokens.css.
 *  Forwards its ref to the underlying <input>/<textarea> — Card.tsx uses this to read
 *  the content textarea's cursor position when inserting a `[[cardId]]` link. */
export const InputField = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputFieldProps>(
  function InputField(props, ref) {
    const { multiline, className, ...rest } = props;
    const classes = `input-field${multiline ? " input-field--multiline" : ""}${className ? ` ${className}` : ""}`;

    if (multiline) {
      return (
        <textarea
          ref={ref as Ref<HTMLTextAreaElement>}
          className={classes}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      );
    }
    return (
      <input
        ref={ref as Ref<HTMLInputElement>}
        className={classes}
        {...(rest as InputHTMLAttributes<HTMLInputElement>)}
      />
    );
  },
);
