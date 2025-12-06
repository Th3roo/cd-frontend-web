import { useState, useCallback } from "react";

export interface SplashNotificationData {
  id: string;
  text: string;
  timestamp: number;
}

/**
 * Hook for managing splash notifications
 *
 * Provides methods to show notifications and tracks active notifications
 */
export const useSplashNotifications = () => {
  const [notifications, setNotifications] = useState<SplashNotificationData[]>(
    [],
  );

  /**
   * Show a new splash notification
   * @param text - The text to display
   */
  const showNotification = useCallback((text: string) => {
    const notification: SplashNotificationData = {
      id: `splash-${Date.now()}-${Math.random()}`,
      text,
      timestamp: Date.now(),
    };

    setNotifications((prev) => [...prev, notification]);
  }, []);

  /**
   * Remove a notification by id
   * @param id - The notification id to remove
   */
  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  /**
   * Clear all notifications
   */
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    showNotification,
    removeNotification,
    clearAll,
  };
};
