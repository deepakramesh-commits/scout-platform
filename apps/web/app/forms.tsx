"use client";

// Small form kit for server actions. Astryx inputs are controlled, so each field keeps its own state and submits by name.
// An action returns an error message to show, or nothing on success; on success the fields remount from fresh props.
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";

export type FormAction = (form: FormData) => Promise<string | void>;
type Option = { value: string; label: string };
type State = { error: string | null; done: number };

export function ActionForm({ action, children, id, done }: { action: FormAction; children: React.ReactNode; id?: string; done?: string }) {
  const [state, run] = useActionState<State, FormData>(async (s, form) => {
    const error = await action(form);
    return error ? { error, done: s.done } : { error: null, done: s.done + 1 };
  }, { error: null, done: 0 });
  return (
    <form action={run} id={id}>
      <VStack gap={2} key={state.done}>
        {state.error && <Banner status="error" title={state.error} collapsible={false} />}
        {!state.error && done && state.done > 0 && <Banner status="success" title={done} collapsible={false} />}
        {children}
      </VStack>
    </form>
  );
}

export function Submit({ label, variant = "primary", size = "md", name, value }: {
  label: string; variant?: "primary" | "secondary" | "ghost" | "destructive"; size?: "sm" | "md"; name?: string; value?: string;
}) {
  const { pending, data } = useFormStatus();
  // With several submit buttons, only the one pressed spins.
  const mine = pending && (!name || data?.get(name) === value);
  return <Button type="submit" label={label} variant={variant} size={size} name={name} value={value} isLoading={mine} />;
}

export function Field({ label, name, value = "", type, placeholder, isRequired, width, description }: {
  label: string; name: string; value?: string; type?: "text" | "email" | "tel" | "search"; placeholder?: string; isRequired?: boolean; width?: number | string; description?: string;
}) {
  const [v, setV] = useState(value);
  return <TextInput label={label} htmlName={name} value={v} onChange={setV} type={type} placeholder={placeholder} isRequired={isRequired} width={width} description={description} />;
}

export function Area({ label, name, value = "", rows = 2, placeholder, maxLength }: { label: string; name: string; value?: string; rows?: number; placeholder?: string; maxLength?: number }) {
  const [v, setV] = useState(value);
  return <TextArea label={label} htmlName={name} value={v} onChange={setV} rows={rows} placeholder={placeholder} maxLength={maxLength} />;
}

export function Choice({ label, name, options, value, placeholder, hasSearch, width, isLabelHidden }: {
  label: string; name: string; options: Option[]; value?: string; placeholder?: string; hasSearch?: boolean; width?: number | string; isLabelHidden?: boolean;
}) {
  const [v, setV] = useState(value);
  return <Selector label={label} htmlName={name} options={options} value={v} onChange={setV} placeholder={placeholder} hasSearch={hasSearch}
    width={width} isLabelHidden={isLabelHidden} presentation="adaptive" />;
}

export function Num({ label, name, value = null, min, max, width = 120 }: { label: string; name: string; value?: number | null; min?: number; max?: number; width?: number }) {
  const [v, setV] = useState<number | null>(value);
  return <NumberInput label={label} htmlName={name} value={v} onChange={setV} min={min} max={max} isIntegerOnly width={width} />;
}

export function Check({ label, name, value = false, description }: { label: string; name: string; value?: boolean; description?: string }) {
  const [v, setV] = useState(value);
  return <CheckboxInput label={label} htmlName={name} value={v} onChange={setV} description={description} />;
}
