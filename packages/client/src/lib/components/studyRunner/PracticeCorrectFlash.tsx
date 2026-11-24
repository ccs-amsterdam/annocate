import { CircleCheck } from "lucide-react";

/** "Correct", briefly over the screen: a practice question was answered right (`usePracticeFlash`). */
export function PracticeCorrectFlash() {
  return (
    <div role="status" className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      <div className="flex animate-in items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-lg font-semibold text-white shadow-lg zoom-in-90 fade-in">
        <CircleCheck className="h-6 w-6" /> Correct
      </div>
    </div>
  );
}
