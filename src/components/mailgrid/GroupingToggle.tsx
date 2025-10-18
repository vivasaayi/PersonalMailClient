import { RadioButtonComponent } from '@syncfusion/ej2-react-buttons';
import { createElement } from 'react';

export type GroupOption = "none" | "sender" | "sender-message";

export interface GroupingToggleOption {
  value: GroupOption;
  label: string;
  hint?: string;
}

interface GroupingToggleProps {
  value: GroupOption;
  onChange: (value: GroupOption) => void;
  options: GroupingToggleOption[];
}

export function GroupingToggle({ value, onChange, options }: GroupingToggleProps) {
  return createElement('div', {
    style: {
      display: 'flex',
      backgroundColor: '#f3f4f6',
      borderRadius: '8px',
      padding: '4px'
    }
  }, options.map(option =>
    createElement(RadioButtonComponent, {
      key: option.value,
      label: option.label,
      name: 'grouping',
      value: option.value,
      checked: value === option.value,
      change: () => onChange(option.value),
      cssClass: 'grouping-radio'
    })
  ));
}
