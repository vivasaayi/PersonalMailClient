import { useCallback, useEffect, useState } from "react";
import type { Account } from "../types";

export function useUIState(accounts: Account[]) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [currentView, setCurrentView] = useState<string>("webmail");
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [connectionWizardOpen, setConnectionWizardOpen] = useState(false);
  const [savedAccountsDialogOpen, setSavedAccountsDialogOpen] = useState(false);

  // Auto-navigate to accounts view when no accounts are connected
  useEffect(() => {
    if (
      accounts.length === 0 &&
      [
        "webmail",
        "deleted",
        "pivot",
        "automation",
        "sync",
        "blocked",
        "blocked-domains",
        "remote-delete"
      ].includes(currentView)
    ) {
      setCurrentView("accounts");
    }
  }, [accounts.length, currentView]);

  const handleDrawerToggle = useCallback(() => {
    setDrawerOpen((prev) => !prev);
  }, []);

  const handleAccountSelect = useCallback((email: string | null) => {
    setSelectedAccount(email);
    if (email) {
      setCurrentView("webmail");
    }
  }, []);

  const handleNavigate = useCallback((view: string) => {
    setCurrentView(view);
  }, []);

  const handleOpenConnectionWizard = useCallback(() => {
    setConnectionWizardOpen(true);
  }, []);

  const handleCloseConnectionWizard = useCallback(() => {
    setConnectionWizardOpen(false);
  }, []);

  const handleOpenSavedAccountsDialog = useCallback(() => {
    setSavedAccountsDialogOpen(true);
  }, []);

  const handleCloseSavedAccountsDialog = useCallback(() => {
    setSavedAccountsDialogOpen(false);
  }, []);

  return {
    drawerOpen,
    currentView,
    selectedAccount,
    connectionWizardOpen,
    savedAccountsDialogOpen,
    setSelectedAccount,
    handleDrawerToggle,
    handleAccountSelect,
    handleNavigate,
    handleOpenConnectionWizard,
    handleCloseConnectionWizard,
    handleOpenSavedAccountsDialog,
    handleCloseSavedAccountsDialog
  };
}
