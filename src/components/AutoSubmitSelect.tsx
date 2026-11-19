"use client";

export function AutoSubmitSelect({
  action,
  name,
  defaultValue,
  options,
  hidden,
}: {
  action: (f: FormData) => Promise<unknown>;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action as (f: FormData) => Promise<void>}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <select name={name} defaultValue={defaultValue} className="input w-auto py-1" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </form>
  );
}
