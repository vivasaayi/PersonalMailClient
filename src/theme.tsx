import React from 'react';
import { setCulture, setCurrencyCode } from '@syncfusion/ej2-base';

// Set culture and locale
setCulture('en-US');
setCurrencyCode('USD');

// Load CLDR data if needed for localization
// loadCldr(require('cldr-data/main/en/ca-gregorian.json'));

interface AppThemeProviderProps {
  children: React.ReactNode;
}

export function AppThemeProvider({ children }: AppThemeProviderProps) {
  return (
    <>
      {children}
    </>
  );
}