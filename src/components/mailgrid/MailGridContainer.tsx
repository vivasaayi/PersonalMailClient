import { createElement } from 'react';
import { ToolbarComponent, ItemsDirective, ItemDirective } from '@syncfusion/ej2-react-navigations';

export interface MailGridContainerProps {
  title?: string;
  subtitle?: string;
  toolbar?: any;
  children: any;
}

export function MailGridContainer({
  title,
  subtitle,
  toolbar,
  children,
}: MailGridContainerProps) {
  return createElement('div', {
    className: 'mail-grid-wrapper',
    style: { height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }
  }, [
    createElement(ToolbarComponent, {
      key: 'toolbar',
      cssClass: 'mail-grid-header',
      style: { borderBottom: '1px solid #e5e7eb' }
    }, [
      createElement(ItemsDirective, { key: 'items' }, [
        createElement(ItemDirective, {
          key: 'title-section',
          template: createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
            title && createElement('div', {
              style: { fontSize: '16px', fontWeight: '600', color: '#111827' }
            }, title),
            subtitle && createElement('div', {
              style: { fontSize: '14px', color: '#6b7280' }
            }, subtitle)
          ])
        }),
        toolbar && createElement(ItemDirective, {
          key: 'toolbar-section',
          align: 'Right',
          template: toolbar
        })
      ])
    ]),
    createElement('div', {
      key: 'content',
      style: { flex: 1, display: 'flex', flexDirection: 'column' }
    }, children)
  ]);
}
