import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import type { EmailSummary, AnalyzedMessage } from "../../types";

interface EmailInsightLike {
  senderEmail: string;
  senderDisplay: string;
  message: AnalyzedMessage;
}

interface EmailDetailPanelProps {
  email: EmailSummary & { senderDomain: string };
  insight: EmailInsightLike | null;
}

const formatDate = (value?: string | null) => {
  if (!value) {
    return "";
  }
  const formatted = dayjs(value);
  if (!formatted.isValid()) {
    return value;
  }
  return formatted.format("MMM D, YYYY h:mm A");
};

const statusLabel = (insight: EmailInsightLike | null) => {
  switch (insight?.message.status) {
    case "allowed":
      return "Allowed";
    case "blocked":
      return "Blocked";
    default:
      return "Neutral";
  }
};

export function EmailDetailPanel({ email, insight }: EmailDetailPanelProps) {
  return (
    <Box sx={{ p: 3, backgroundColor: (theme) => theme.palette.background.default }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ color: (theme) => theme.palette.text.primary }}>
            {email.subject || "(No subject)"}
          </Typography>
          <Typography variant="body2" sx={{ color: (theme) => theme.palette.text.secondary }}>
            {formatDate(email.date)}
          </Typography>
          <Typography variant="body2" sx={{ color: (theme) => theme.palette.text.secondary }}>
            From {insight?.senderDisplay ?? email.sender.display_name ?? email.sender.email} ({
              insight?.senderEmail ?? email.sender.email
            })
          </Typography>
        </Box>

        <Divider />

        {insight ? (
          <Stack spacing={2}>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              <Chip label={`Status: ${statusLabel(insight)}`} size="small" variant="outlined" />
              {insight.message.analysis_sentiment && (
                <Chip
                  label={`Sentiment: ${insight.message.analysis_sentiment}`}
                  size="small"
                  color={
                    insight.message.analysis_sentiment === "positive"
                      ? "success"
                      : insight.message.analysis_sentiment === "negative"
                        ? "error"
                        : "default"
                  }
                />
              )}
            </Box>
            <Typography variant="body2" sx={{ color: (theme) => theme.palette.text.primary }}>
              {insight.message.analysis_summary ?? insight.message.snippet ?? "No preview available."}
            </Typography>
            {insight.message.analysis_categories.length > 0 && (
              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                {insight.message.analysis_categories.map((category) => (
                  <Chip key={category} label={category} size="small" variant="outlined" sx={{ fontSize: "0.7rem" }} />
                ))}
              </Box>
            )}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: (theme) => theme.palette.text.secondary }}>
            No additional analysis is available yet for this message.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
