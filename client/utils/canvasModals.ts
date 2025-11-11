export interface NotificationOptions {
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export interface NotificationState {
  show: boolean;
  type: 'success' | 'error' | 'info' | 'confirm';
  title: string;
  message: string;
  options?: NotificationOptions;
}

export interface ShareOverlayState {
  show: boolean;
  url: string;
  error?: string;
  copied?: boolean;
}

export interface InputOverlayState {
  show: boolean;
  title: string;
  placeholder: string;
  defaultValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export interface DeleteOverlayState {
  show: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface ModalManagerDependencies {
  setNotification: (state: NotificationState) => void;
  setShareOverlay: (state: ShareOverlayState) => void;
  setInputOverlay: (state: InputOverlayState) => void;
  setDeleteOverlay: (state: DeleteOverlayState) => void;
}

export class CanvasModalManager {
  constructor(private deps: ModalManagerDependencies) {}

  /**
   * Shows a notification with the specified type and message
   */
  showNotification = (
    type: 'success' | 'error' | 'info' | 'confirm',
    title: string,
    message: string,
    options?: NotificationOptions
  ) => {
    this.deps.setNotification({
      show: true,
      type,
      title,
      message,
      options
    });
  };

  /**
   * Hides the current notification
   */
  hideNotification = () => {
    this.deps.setNotification(prev => ({ ...prev, show: false }));
  };

  /**
   * Shows the share overlay with a URL
   */
  showShareOverlay = (url: string, copied: boolean = false, error?: string) => {
    this.deps.setShareOverlay({
      show: true,
      url,
      copied,
      error
    });
  };

  /**
   * Hides the share overlay
   */
  hideShareOverlay = () => {
    this.deps.setShareOverlay({ show: false, url: '' });
  };

  /**
   * Updates the share overlay copy status
   */
  updateShareOverlayCopyStatus = (copied: boolean) => {
    this.deps.setShareOverlay(prev => ({ ...prev, copied }));
  };

  /**
   * Shows an input overlay for text input
   */
  showInputOverlay = (
    title: string,
    placeholder: string,
    defaultValue: string,
    onConfirm: (value: string) => void,
    onCancel: () => void
  ) => {
    this.deps.setInputOverlay({
      show: true,
      title,
      placeholder,
      defaultValue,
      onConfirm,
      onCancel
    });
  };

  /**
   * Hides the input overlay
   */
  hideInputOverlay = () => {
    this.deps.setInputOverlay(prev => ({ ...prev, show: false }));
  };

  /**
   * Shows a delete confirmation overlay
   */
  showDeleteOverlay = (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel: () => void
  ) => {
    this.deps.setDeleteOverlay({
      show: true,
      title,
      message,
      onConfirm,
      onCancel
    });
  };

  /**
   * Hides the delete overlay
   */
  hideDeleteOverlay = () => {
    this.deps.setDeleteOverlay(prev => ({ ...prev, show: false }));
  };

  /**
   * Shows a success notification
   */
  showSuccess = (title: string, message: string) => {
    this.showNotification('success', title, message);
  };

  /**
   * Shows an error notification
   */
  showError = (title: string, message: string) => {
    this.showNotification('error', title, message);
  };

  /**
   * Shows an info notification
   */
  showInfo = (title: string, message: string) => {
    this.showNotification('info', title, message);
  };

  /**
   * Shows a confirmation dialog
   */
  showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel?: () => void,
    confirmText?: string,
    cancelText?: string
  ) => {
    this.showNotification('confirm', title, message, {
      onConfirm,
      onCancel: onCancel || this.hideNotification,
      confirmText,
      cancelText
    });
  };
}

/**
 * Default state factories for modal states
 */
export const createDefaultNotificationState = (): NotificationState => ({
  show: false,
  type: 'info',
  title: '',
  message: ''
});

export const createDefaultShareOverlayState = (): ShareOverlayState => ({
  show: false,
  url: ''
});

export const createDefaultInputOverlayState = (): InputOverlayState => ({
  show: false,
  title: '',
  placeholder: '',
  defaultValue: '',
  onConfirm: () => {},
  onCancel: () => {}
});

export const createDefaultDeleteOverlayState = (): DeleteOverlayState => ({
  show: false,
  title: '',
  message: '',
  onConfirm: () => {},
  onCancel: () => {}
});
