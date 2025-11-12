import { ButtonComponent } from "@syncfusion/ej2-react-buttons";

interface AppBarProps {
  onDrawerToggle: () => void;
  onBulkAnalysisToggle: () => void;
  onAssistantToggle: () => void;
  hasAccounts: boolean;
  assistantActive: boolean;
  isPanelOpen: boolean;
}

function AppBar({
  onDrawerToggle,
  onBulkAnalysisToggle,
  onAssistantToggle,
  hasAccounts,
  assistantActive,
  isPanelOpen
}: AppBarProps) {
  return (
    <header
      style={{
        backgroundColor: "#ffffff",
        color: "#000000",
        borderBottom: "1px solid #e5e7eb",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        zIndex: 1100
      }}
    >
      <ButtonComponent
        cssClass="menu-button"
        content="☰"
        onClick={onDrawerToggle}
      />
      <h1
        style={{
          flexGrow: 1,
          fontSize: "1.25rem",
          fontWeight: "500",
          margin: "0 0 0 16px"
        }}
      >
        Personal Mail Client
      </h1>
      <ButtonComponent
        cssClass={isPanelOpen ? "primary" : "outlined"}
        content="Bulk AI"
        disabled={!hasAccounts}
        onClick={onBulkAnalysisToggle}
      />
      <ButtonComponent
        cssClass={assistantActive ? "primary" : "outlined"}
        content={assistantActive ? "Close Assistant" : "AI Assistant"}
        onClick={onAssistantToggle}
      />
    </header>
  );
}

export default AppBar;