import { ButtonComponent } from "@syncfusion/ej2-react-buttons";

interface WelcomeViewProps {
  onConnectAccount: () => void;
  onOpenSavedAccounts: () => void;
}

function WelcomeView({ onConnectAccount, onOpenSavedAccounts }: WelcomeViewProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        textAlign: "center"
      }}
    >
      <h2 style={{ marginBottom: "16px" }}>Welcome to Personal Mail Client</h2>
      <p style={{ marginBottom: "32px", color: "#6b7280" }}>
        Connect an email account to get started with professional email management.
      </p>
      <div style={{ display: "flex", gap: "12px" }}>
        <ButtonComponent
          cssClass="primary large"
          content="+ Connect Account"
          onClick={onConnectAccount}
        />
        <ButtonComponent
          cssClass="e-outline large"
          content="Saved Accounts"
          onClick={onOpenSavedAccounts}
        />
      </div>
    </div>
  );
}

export default WelcomeView;