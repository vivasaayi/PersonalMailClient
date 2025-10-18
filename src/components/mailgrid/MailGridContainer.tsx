import { Box, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

export interface MailGridContainerProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function MailGridContainer({
  title,
  subtitle,
  toolbar,
  children,
}: MailGridContainerProps) {
  return (
    <Box className="mail-grid-wrapper" sx={{ height: "100%", width: "100%" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ xs: "flex-start", sm: "center" }}
        justifyContent="space-between"
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
          backgroundColor: (theme) => theme.palette.background.paper,
        }}
      >
        <Stack spacing={0.5}>
          {title ? (
            <Typography variant="subtitle1" sx={{ color: (theme) => theme.palette.text.primary, fontWeight: 600 }}>
              {title}
            </Typography>
          ) : null}
          {subtitle ? (
            <Typography variant="body2" sx={{ color: (theme) => theme.palette.text.secondary }}>
              {subtitle}
            </Typography>
          ) : null}
        </Stack>
        {toolbar ? <Box sx={{ ml: { sm: "auto" } }}>{toolbar}</Box> : null}
      </Stack>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</Box>
    </Box>
  );
}
