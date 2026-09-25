/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  Telegram?: {
    WebApp?: {
      initData: string;
      initDataUnsafe?: {
        user?: {
          id: number;
          first_name: string;
          last_name?: string;
          username?: string;
          language_code?: string;
        };
      };
      colorScheme?: 'light' | 'dark';
      themeParams?: Record<string, string>;
      isExpanded?: boolean;
      viewportHeight?: number;
      viewportStableHeight?: number;
      headerColor?: string;
      backgroundColor?: string;
      ready: () => void;
      expand: () => void;
      close: () => void;
      openLink: (url: string) => void;
      openTelegramLink: (url: string) => void;
      showAlert: (message: string, callback?: () => void) => void;
      showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void;
      openInvoice: (url: string, callback?: (status: string) => void) => void;
      HapticFeedback?: {
        impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
        notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
        selectionChanged: () => void;
      };
    };
  };
  Paddle?: {
    Initialize: (options: { token: string; environment?: string }) => void;
    Checkout: {
      open: (options: any) => void;
    };
  };
}
