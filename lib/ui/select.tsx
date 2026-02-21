import * as React from "react";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

type SelectContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

export function Select({ value, onChange, children, ...props }: SelectProps) {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event);
  };

  return (
    <SelectContext.Provider value={{ value: value as string | undefined }}>
      <select value={value} onChange={handleChange} {...props}>
        {children}
      </select>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = React.useContext(SelectContext);
  if (context?.value) return <>{context.value}</>;
  return <>{placeholder ?? null}</>;
}

export function SelectContent({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props}>{children}</div>;
}

export function SelectItem({ children, value, ...props }: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return (
    <option value={value} {...props}>
      {children}
    </option>
  );
}
