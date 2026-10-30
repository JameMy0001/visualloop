import React from "react";
import { FeedbackStatus } from "@visualloop/protocol";

interface StatusBarProps {
  status: FeedbackStatus | string;
  revision: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ status, revision }) => {
  return (
    <div className="h-6 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between text-[11px] text-slate-400">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span>Status: <strong className="text-slate-300 capitalize">{status}</strong></span>
      </div>
      <div className="flex items-center gap-3">
        <span>Revision: <strong className="text-slate-300">#{revision}</strong></span>
        <span>Local-first • Port 4178</span>
      </div>
    </div>
  );
};
