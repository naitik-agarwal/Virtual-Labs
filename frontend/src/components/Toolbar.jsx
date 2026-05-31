import React from 'react';

const Toolbar = ({ activeTool, onSetTool, onAddShape, onClear, onToggleGravity, onOpenLibrary, isZeroG, isHost }) => {
  return (
    <div className="w-full flex justify-center sticky top-4 z-40 mb-6">
      <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 px-8 py-4 bg-slate-900/95 backdrop-blur-xl border border-slate-700 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] rounded-full w-max transition-all hover:border-slate-600">
        
        {/* --- TOOLS --- */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Tools</span>
          <button onClick={() => onSetTool('pointer')} className={`px-4 py-2 text-sm font-bold rounded-full transition-all duration-200 ${activeTool === 'pointer' ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>👆 Drag</button>
          <button onClick={() => onSetTool('joint')} className={`px-4 py-2 text-sm font-bold rounded-full transition-all duration-200 ${activeTool === 'joint' ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>🔗 Joint</button>
          <button onClick={() => onSetTool('spring')} className={`px-4 py-2 text-sm font-bold rounded-full transition-all duration-200 ${activeTool === 'spring' ? 'bg-rose-500 text-white shadow-[0_0_15px_rgba(244,63,94,0.5)]' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}>〰️ Spring</button>
        </div>

        <div className="hidden md:block w-px h-8 bg-slate-700"></div>

        {/* --- OBJECTS --- */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">Spawn</span>
          <button onClick={() => onAddShape('box')} className="px-4 py-2 text-sm font-bold bg-slate-800 text-slate-200 rounded-full hover:bg-blue-500 hover:text-white transition-all">Box</button>
          <button onClick={() => onAddShape('circle')} className="px-4 py-2 text-sm font-bold bg-slate-800 text-slate-200 rounded-full hover:bg-emerald-500 hover:text-white transition-all">Circle</button>
          <button onClick={() => onAddShape('heavyBox')} className="px-5 py-2 text-sm font-black bg-gradient-to-r from-slate-700 to-slate-600 text-white rounded-full hover:from-slate-600 hover:to-slate-500 shadow-lg border border-slate-500/30 transition-all">Anvil</button>
        </div>

        {/* --- HOST CONTROLS --- */}
        {isHost && (
          <>
            <div className="hidden md:block w-px h-8 bg-slate-700"></div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-1">System</span>
              
              <button onClick={onOpenLibrary} className="px-4 py-2 text-sm font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full hover:bg-emerald-500 hover:text-white transition-all">
                📚 Library
              </button>
              
              <button onClick={onToggleGravity} className={`px-4 py-2 text-sm font-bold rounded-full transition-all duration-200 ${isZeroG ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}>
                {isZeroG ? '🌌 Zero-G' : '🌍 Earth Grav'}
              </button>
              
              <button onClick={onClear} className="px-4 py-2 text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/30 rounded-full hover:bg-red-500 hover:text-white transition-all">
                🗑️ Clear
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Toolbar;