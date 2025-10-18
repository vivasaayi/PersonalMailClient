import { ToggleButton, ToggleButtonGroup, Tooltip } from "@mui/material";
import type { SyntheticEvent } from "react";

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
  const handleChange = (_event: SyntheticEvent, next: GroupOption | null) => {
    if (!next) {
      return;
    }
    onChange(next);
  };

  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={handleChange}
      size="small"
      sx={{
        backgroundColor: "#f3f4f6",
        borderRadius: 2,
        "& .MuiToggleButton-root": {
          textTransform: "none",
          fontSize: "0.85rem",
          px: 1.5,
        },
      }}
    >
      {options.map((option) => {
        const button = (
          <ToggleButton key={option.value} value={option.value} disableRipple>
            {option.label}
          </ToggleButton>
        );

        return option.hint ? (
          <Tooltip key={option.value} title={option.hint} arrow placement="top">
            <span>{button}</span>
          </Tooltip>
        ) : (
          button
        );
      })}
    </ToggleButtonGroup>
  );
}
