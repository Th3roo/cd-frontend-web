import { useEffect, useState } from "react";

export interface SplashNotificationData {
  id: string;
  text: string;
  timestamp: number;
}

interface SplashNotificationProps {
  notification: SplashNotificationData;
  onComplete: (id: string) => void;
}

export const SplashNotification: React.FC<SplashNotificationProps> = ({
  notification,
  onComplete,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // Быстрое появление
    setTimeout(() => {
      setIsVisible(true);
    }, 50);

    // Начинаем затухание через 2 секунды
    const fadeOutTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 2000);

    // Полное удаление через 3.5 секунды
    const removeTimer = setTimeout(() => {
      onComplete(notification.id);
    }, 3500);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(removeTimer);
    };
  }, [notification.id, onComplete]);

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-[10000] pointer-events-none transition-all duration-200 ${
        isVisible && !isFadingOut
          ? "opacity-100 scale-100"
          : isFadingOut
            ? "opacity-0 scale-95 transition-opacity duration-1500"
            : "opacity-0 scale-90"
      }`}
    >
      <div className="text-white text-5xl font-bold text-center tracking-wider drop-shadow-[0_0_20px_rgba(6,182,212,0.8)]">
        {notification.text}
      </div>
    </div>
  );
};
