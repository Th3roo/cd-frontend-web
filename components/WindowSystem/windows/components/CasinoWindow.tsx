import { FC, useState, useEffect } from "react";

interface CasinoWindowProps {
  onClose?: () => void;
}

const CasinoWindow: FC<CasinoWindowProps> = ({ onClose }) => {
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [winnings, setWinnings] = useState(12050);
  const [total, setTotal] = useState(70055020);
  const [percentage, setPercentage] = useState(14);
  const [baseWinnings] = useState(12050);
  const [baseTotal] = useState(70055020);
  const [hasReset, setHasReset] = useState(false);

  useEffect(() => {
    if (isLoading && progress < 100) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          const next = prev + Math.random() * 3;
          if (next >= 100) {
            setIsLoading(false);
            return 100;
          }

          // Random reset between 70-99%
          if (next >= 70 && next < 99 && !hasReset && Math.random() < 0.15) {
            setHasReset(true);
            setIsLoading(false);
            setProgress(0);
            setPercentage(0);
            setWinnings(0);
            return 0;
          }

          // Update values as progress increases
          const progressPercent = next / 100;
          setPercentage(Math.floor(14 + progressPercent * 86)); // 14% to 100%
          setWinnings(
            Math.floor(
              baseWinnings + (baseTotal - baseWinnings) * progressPercent,
            ),
          );

          return next;
        });
      }, 100);

      return () => clearInterval(interval);
    }
  }, [isLoading, progress, baseWinnings, baseTotal, hasReset]);

  const handleYes = () => {
    if (!isLoading) {
      setProgress(0);
      setIsLoading(true);
      setHasReset(false);
      setPercentage(14);
      setWinnings(12050);
    }
  };

  const handleNo = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <div className="p-6 text-gray-300 bg-neutral-900 h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-md space-y-6">
        {/* Header with icon */}
        <div className="flex items-center gap-3 justify-center">
          <div className="text-4xl">🎰</div>
          <h2 className="text-2xl font-bold text-red-500">Взлом казино</h2>
        </div>

        {/* Message */}
        <div className="text-center space-y-2">
          {hasReset && winnings === 0 ? (
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500 mb-4">💸</p>
              <p className="text-lg font-semibold text-red-400">
                Вы депнули все что можно.
              </p>
              <p className="text-lg font-semibold text-red-400">
                Теперь вы без трусов и без собачки
              </p>
              <p className="text-xl font-semibold mt-4">Попробовать еще раз?</p>
            </div>
          ) : (
            <>
              <p className="text-lg">
                Казино взломанно на{" "}
                <span className="font-bold text-green-400">{percentage}%</span>.
              </p>
              <p className="text-lg">
                Выкачанно{" "}
                <span className="font-bold text-yellow-400">
                  {winnings.toLocaleString("ru-RU")} руб.
                </span>{" "}
                из{" "}
                <span className="font-bold text-red-400">
                  {total.toLocaleString("ru-RU")} руб.
                </span>
              </p>
              <p className="text-xl font-semibold mt-4">Продолжить?</p>
            </>
          )}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-neutral-700 rounded-full h-6 overflow-hidden border border-neutral-600">
          <div
            className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-200 ease-out flex items-center justify-end pr-2"
            style={{ width: `${progress}%` }}
          >
            {progress > 10 && (
              <span className="text-xs font-bold text-white">
                {Math.floor(progress)}%
              </span>
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={handleYes}
            disabled={isLoading}
            className="px-8 py-3 bg-neutral-700 hover:bg-neutral-600 border-2 border-neutral-500 rounded text-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
          >
            Да
          </button>
          <button
            onClick={handleNo}
            disabled={isLoading}
            className="px-8 py-3 bg-neutral-700 hover:bg-neutral-600 border-2 border-neutral-500 rounded text-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
          >
            Нет
          </button>
        </div>
      </div>
    </div>
  );
};

export default CasinoWindow;
