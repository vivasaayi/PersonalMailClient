import type { ReactNode } from "react";
import { ToolbarComponent, ItemsDirective, ItemDirective } from "@syncfusion/ej2-react-navigations";

export interface MailGridContainerProps {
  title?: string;
  subtitle?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function MailGridContainer({
  title,
  subtitle,
  toolbar,
  children
}: MailGridContainerProps) {
  const titleTemplate = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {title && (
        <div style={{ fontSize: "16px", fontWeight: 600, color: "#111827" }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: "14px", color: "#6b7280" }}>
          {subtitle}
        </div>
      )}
    </div>
  );

  const toolbarTemplate = toolbar ? () => toolbar : undefined;

  return (
    <div
      className="mail-grid-wrapper"
      style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}
    >
      <ToolbarComponent cssClass="mail-grid-header" style={{ borderBottom: "1px solid #e5e7eb" }}>
        <ItemsDirective>
          <ItemDirective template={titleTemplate} />
          {toolbarTemplate && <ItemDirective align="Right" template={toolbarTemplate} />}
        </ItemsDirective>
      </ToolbarComponent>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}
