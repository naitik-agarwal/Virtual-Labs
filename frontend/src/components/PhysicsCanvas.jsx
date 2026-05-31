import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { initPhysics } from '../physics/engineSetup';
import Toolbar from './Toolbar';
import { socket } from '/sockets/socketManager'; 
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const PhysicsCanvas = () => {
  const sceneRef = useRef(null);
  const engineRef = useRef(null);
  const runnerRef = useRef(null);
  const mouseConstraintRef = useRef(null); 
  
  const guestDraggingIdRef = useRef(null); 
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const hudBodiesRef = useRef(null);
  const hudConstraintsRef = useRef(null);
  
  const [activeTool, setActiveTool] = useState('pointer');
  const activeToolRef = useRef(activeTool); 
  const selectedBodyForConstraintRef = useRef(null);

  const [roomId, setRoomId] = useState('');
  const [hasJoined, setHasJoined] = useState(false);
  const [role, setRole] = useState(null);
  const [isZeroG, setIsZeroG] = useState(false);
  const [chartData, setChartData] = useState([]);
  const lastChartUpdateRef = useRef(Date.now());

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [newExpName, setNewExpName] = useState('');
  const [savedExperiments, setSavedExperiments] = useState([]);

  useEffect(() => {
    activeToolRef.current = activeTool;
    selectedBodyForConstraintRef.current = null; 
    if (mouseConstraintRef.current) mouseConstraintRef.current.collisionFilter.mask = activeTool === 'pointer' ? 0xFFFFFFFF : 0x00000000;
  }, [activeTool]);

  useEffect(() => {
    if (!sceneRef.current) return;
    socket.connect();
    const { engine, runner, mouseConstraint, cleanup } = initPhysics(sceneRef);
    engineRef.current = engine; runnerRef.current = runner; mouseConstraintRef.current = mouseConstraint;
    let handleCanvasMouseDown, handleGuestMouseMove, handleGuestMouseUp;
    const canvas = sceneRef.current.querySelector('canvas');

    socket.on('role-assigned', (data) => {
      setRole(data.role);
      if (data.role === 'host') {
        Matter.Runner.run(runnerRef.current, engineRef.current);
        Matter.Events.on(engineRef.current, 'afterUpdate', () => {
          const allBodies = Matter.Composite.allBodies(engineRef.current.world);
          const allConstraints = Matter.Composite.allConstraints(engineRef.current.world);
          const now = Date.now();
          
          if (engineRef.current.timing.timestamp % 10 < 2) {
            if (hudBodiesRef.current) hudBodiesRef.current.innerText = allBodies.filter(b => !b.isStatic).length;
            if (hudConstraintsRef.current) hudConstraintsRef.current.innerText = allConstraints.filter(c => !(mouseConstraintRef.current && c === mouseConstraintRef.current.constraint)).length;
          }

          if (now - lastChartUpdateRef.current > 500) {
            let totalKE = 0;
            allBodies.forEach(b => {
              if (!b.isStatic && !b.isGuestDragging) totalKE += 0.5 * b.mass * ((b.velocity.x * b.velocity.x) + (b.velocity.y * b.velocity.y));
            });
            setChartData(prev => {
              const newData = [...prev, { time: new Date().toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit' }), energy: Math.round(totalKE) }];
              return newData.slice(-15); 
            });
            lastChartUpdateRef.current = now;
          }

          allBodies.forEach(b => { if (b.isGuestDragging) { Matter.Body.setVelocity(b, { x: 0, y: 0 }); Matter.Body.setAngularVelocity(b, 0); b.force = { x: 0, y: 0 }; }});
          socket.emit('physics-sync', allBodies.filter(b => !b.isStatic || b.isGuestDragging).map(b => ({ id: b.id, x: b.position.x, y: b.position.y, angle: b.angle, velocity: b.velocity })));
        });
        socket.on('host-apply-guest-grab', ({ id }) => { const body = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === id); if (body) body.isGuestDragging = true; });
        socket.on('host-apply-guest-drag', (dragData) => { const body = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === dragData.id); if (body) Matter.Body.setPosition(body, { x: dragData.x, y: dragData.y }); });
        socket.on('host-apply-guest-drop', ({ id }) => { const body = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === id); if (body) { body.isGuestDragging = false; Matter.Body.set(body, 'isSleeping', false); }});
      } else {
        Matter.Runner.stop(runnerRef.current);
        socket.emit('request-initial-state');
      }

      if (canvas) {
        const getLogicalMouse = (e) => { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) * (1200 / rect.width), y: (e.clientY - rect.top) * (800 / rect.height) };};
        handleCanvasMouseDown = (e) => {
          const mousePos = getLogicalMouse(e);
          const clicked = Matter.Query.point(Matter.Composite.allBodies(engineRef.current.world).filter(b => !b.isStatic), mousePos);
          if (clicked.length > 0) {
            const body = clicked[0];
            if (activeToolRef.current === 'pointer' && role === 'guest') {
              guestDraggingIdRef.current = body.id; dragOffsetRef.current = { x: body.position.x - mousePos.x, y: body.position.y - mousePos.y }; socket.emit('guest-grab', { id: body.id });
            } 
            else if (activeToolRef.current === 'joint' || activeToolRef.current === 'spring') {
              if (!selectedBodyForConstraintRef.current) {
                selectedBodyForConstraintRef.current = body.id;
              } else if (selectedBodyForConstraintRef.current !== body.id) {
                const bodyA = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === selectedBodyForConstraintRef.current);
                if (bodyA) {
                  const constraintData = {
                    id: Math.floor(Math.random() * 10000000),
                    type: activeToolRef.current,
                    bodyAId: bodyA.id,
                    bodyBId: body.id,
                    length: activeToolRef.current === 'spring' ? 0 : Math.hypot(bodyA.position.x - body.position.x, bodyA.position.y - body.position.y)
                  };
                  spawnConstraintLocal(constraintData); 
                  socket.emit('spawn-constraint', constraintData);
                }
                selectedBodyForConstraintRef.current = null;
              }
            }
          } else selectedBodyForConstraintRef.current = null;
        };
        handleGuestMouseMove = (e) => {
          if (activeToolRef.current !== 'pointer' || !guestDraggingIdRef.current) return;
          const mousePos = getLogicalMouse(e);
          const draggingBody = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === guestDraggingIdRef.current);
          if (draggingBody) {
            let tX = Math.max(40, Math.min(1160, mousePos.x + dragOffsetRef.current.x)), tY = Math.max(40, Math.min(720, mousePos.y + dragOffsetRef.current.y));
            Matter.Body.setPosition(draggingBody, { x: tX, y: tY }); Matter.Body.setVelocity(draggingBody, { x: 0, y: 0 }); socket.emit('guest-drag', { id: draggingBody.id, x: tX, y: tY });
          }
        };
        handleGuestMouseUp = () => { if (guestDraggingIdRef.current) { socket.emit('guest-drop', { id: guestDraggingIdRef.current }); guestDraggingIdRef.current = null; }};
        canvas.addEventListener('mousedown', handleCanvasMouseDown); window.addEventListener('mousemove', handleGuestMouseMove); window.addEventListener('mouseup', handleGuestMouseUp);
      }
    });

    socket.on('provide-initial-state', (targetId) => {
      if (!engineRef.current) return;
      const snapshotBodies = Matter.Composite.allBodies(engineRef.current.world).filter(b => !b.isStatic && b.plugin && b.plugin.customType).map(b => ({ id: b.id, type: b.plugin.customType, x: b.position.x, y: b.position.y, angle: b.angle, velocity: b.velocity }));
      const snapshotConstraints = Matter.Composite.allConstraints(engineRef.current.world).filter(c => !(mouseConstraintRef.current && c === mouseConstraintRef.current.constraint)).map(c => ({ id: c.id, type: c.plugin?.customType || 'joint', bodyAId: c.bodyA.id, bodyBId: c.bodyB.id, length: c.length }));
      socket.emit('initial-state-response', { targetId, bodies: snapshotBodies, constraints: snapshotConstraints });
    });

    socket.on('sync-initial-state', (data) => {
      if (!engineRef.current) return;
      data.bodies.forEach(bodyData => { spawnBodyLocal(bodyData); });
      data.constraints.forEach(cData => { spawnConstraintLocal(cData); });
      if (hudBodiesRef.current) hudBodiesRef.current.innerText = data.bodies.length;
      if (hudConstraintsRef.current) hudConstraintsRef.current.innerText = data.constraints.length;
    });

    socket.on('sync-update', (serverBodies) => {
      if (!engineRef.current) return;
      serverBodies.forEach(serverBody => {
        if (guestDraggingIdRef.current === serverBody.id) return;
        const localBody = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === serverBody.id);
        if (localBody) { Matter.Body.setPosition(localBody, { x: serverBody.x, y: serverBody.y }); Matter.Body.setAngle(localBody, serverBody.angle); Matter.Body.setVelocity(localBody, serverBody.velocity); }
      });
      if (hudBodiesRef.current) hudBodiesRef.current.innerText = serverBodies.length;
    });

    socket.on('shape-spawned', (shapeData) => {
      if (!engineRef.current) return;
      if (Matter.Composite.allBodies(engineRef.current.world).some(b => b.id === shapeData.id)) return;
      spawnBodyLocal(shapeData);
    });

    socket.on('constraint-spawned', (data) => {
      if (!engineRef.current) return;
      if (Matter.Composite.allConstraints(engineRef.current.world).some(c => c.id === data.id)) return;
      spawnConstraintLocal(data);
    });

    socket.on('canvas-cleared', () => {
      if (!engineRef.current) return;
      Matter.World.remove(engineRef.current.world, Matter.Composite.allBodies(engineRef.current.world).filter(b => !b.isStatic));
      Matter.World.remove(engineRef.current.world, Matter.Composite.allConstraints(engineRef.current.world).filter(c => !(mouseConstraintRef.current && c === mouseConstraintRef.current.constraint)));
      guestDraggingIdRef.current = null; selectedBodyForConstraintRef.current = null; setChartData([]); 
    });

    socket.on('environment-updated', (envData) => {
      if (!engineRef.current) return;
      setIsZeroG(envData.isZeroG); engineRef.current.world.gravity.y = envData.isZeroG ? 0 : 1;
    });

    socket.on('experiments-list', (list) => { setSavedExperiments(list); });

    return () => {
      cleanup();
      if (engineRef.current) Matter.Events.off(engineRef.current, 'afterUpdate');
      if (handleCanvasMouseDown && canvas) canvas.removeEventListener('mousedown', handleCanvasMouseDown);
      if (handleGuestMouseMove) window.removeEventListener('mousemove', handleGuestMouseMove);
      if (handleGuestMouseUp) window.removeEventListener('mouseup', handleGuestMouseUp);
      socket.disconnect(); socket.off(); 
    };
  }, []);

  const handleJoinRoom = (e) => { e.preventDefault(); if (roomId.trim() === '') return; socket.emit('join-room', roomId); setHasJoined(true); };
  
  const spawnBodyLocal = (shapeData) => {
    if (!engineRef.current) return;
    let newBody;
    if (shapeData.type === 'box') newBody = Matter.Bodies.rectangle(shapeData.x || shapeData.startX, shapeData.y || shapeData.startY, 60, 60, { restitution: 0.6, render: { fillStyle: '#3b82f6' } });
    else if (shapeData.type === 'circle') newBody = Matter.Bodies.circle(shapeData.x || shapeData.startX, shapeData.y || shapeData.startY, 30, { restitution: 0.9, render: { fillStyle: '#10b981' } });
    else if (shapeData.type === 'heavyBox') newBody = Matter.Bodies.rectangle(shapeData.x || shapeData.startX, shapeData.y || shapeData.startY, 80, 80, { density: 0.1, restitution: 0.1, render: { fillStyle: '#334155' } });
    if (newBody) { 
      newBody.id = shapeData.id; newBody.plugin = { customType: shapeData.type }; 
      if(shapeData.angle) Matter.Body.setAngle(newBody, shapeData.angle);
      if(shapeData.velocity) Matter.Body.setVelocity(newBody, shapeData.velocity);
      Matter.World.add(engineRef.current.world, newBody); 
    }
  };

  const spawnConstraintLocal = (data) => {
    if (!engineRef.current) return;
    const bodyA = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === data.bodyAId);
    const bodyB = Matter.Composite.allBodies(engineRef.current.world).find(b => b.id === data.bodyBId);
    if (bodyA && bodyB) {
      const options = { bodyA, bodyB, length: data.length, id: data.id, plugin: { customType: data.type }};
      if (data.type === 'spring') { options.stiffness = 0.02; options.render = { type: 'line', strokeStyle: '#f43f5e', lineWidth: 4 }; } 
      else { options.stiffness = 1; options.render = { type: 'line', strokeStyle: '#6366f1', lineWidth: 6 }; }
      Matter.World.add(engineRef.current.world, Matter.Constraint.create(options));
    }
  };

  const handleAddShape = (type) => { if (!sceneRef.current) return; const shapeData = { type, startX: 1200 / 2 + (Math.random() * 40 - 20), startY: 100, id: Math.floor(Math.random() * 10000000) }; spawnBodyLocal(shapeData); socket.emit('spawn-shape', shapeData); };
  const handleClearCanvas = () => { if (role === 'host') socket.emit('clear-canvas'); };
  const handleToggleGravity = () => { if (role === 'host') { const newZeroGState = !isZeroG; setIsZeroG(newZeroGState); engineRef.current.world.gravity.y = newZeroGState ? 0 : 1; socket.emit('update-environment', { isZeroG: newZeroGState }); } };
  const openLibrary = () => { socket.emit('request-experiments'); setIsLibraryOpen(true); };
  const handleSaveExperiment = (e) => {
    e.preventDefault();
    if (!newExpName.trim() || !engineRef.current) return;
    const snapshotBodies = Matter.Composite.allBodies(engineRef.current.world).filter(b => !b.isStatic && b.plugin && b.plugin.customType).map(b => ({ id: b.id, type: b.plugin.customType, x: b.position.x, y: b.position.y, angle: b.angle, velocity: b.velocity }));
    const snapshotConstraints = Matter.Composite.allConstraints(engineRef.current.world).filter(c => !(mouseConstraintRef.current && c === mouseConstraintRef.current.constraint)).map(c => ({ id: c.id, type: c.plugin?.customType || 'joint', bodyAId: c.bodyA.id, bodyBId: c.bodyB.id, length: c.length }));
    socket.emit('save-experiment', { name: newExpName, bodies: snapshotBodies, constraints: snapshotConstraints });
    setNewExpName('');
  };
  const handleLoadExperiment = (exp) => { socket.emit('trigger-load-experiment', exp); setIsLibraryOpen(false); };
  const handleDeleteExperiment = (id) => { if (window.confirm("Are you sure you want to delete this template?")) socket.emit('delete-experiment', id); };

  return (
    <div className="flex flex-col items-center pt-10 min-h-screen text-slate-800 selection:bg-blue-500 selection:text-white px-6">
      
      {/* GLOWING JOIN ROOM MODAL */}
      {!hasJoined && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl flex justify-center items-center z-50 p-4">
          <div className="bg-white p-12 rounded-[2.5rem] shadow-[0_0_80px_rgba(59,130,246,0.3)] w-full max-w-md border-4 border-white relative overflow-hidden">
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
            <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
            
            <div className="relative z-10">
              <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Access Lab</h2>
              <p className="text-slate-500 mb-8 font-medium">Enter your session ID to connect to the physics engine.</p>
              <form onSubmit={handleJoinRoom} className="flex flex-col gap-5">
                <input type="text" placeholder="e.g., room-77" className="px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-600 focus:ring-0 outline-none transition-all text-slate-800 font-bold text-lg placeholder:font-medium placeholder:text-slate-400 shadow-inner" value={roomId} onChange={(e) => setRoomId(e.target.value)} autoFocus />
                <button type="submit" className="px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-lg rounded-2xl shadow-[0_10px_20px_-10px_rgba(59,130,246,0.8)] transition-all active:scale-95">Initialize Connection &rarr;</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* LIBRARY MODAL */}
      {isLibraryOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex justify-center items-center z-50 p-4">
          <div className="bg-white p-8 rounded-[2rem] shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-slate-100">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Experiment Library</h2>
              <button onClick={() => setIsLibraryOpen(false)} className="w-10 h-10 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 rounded-full font-bold text-xl flex items-center justify-center transition-all">&times;</button>
            </div>
            
            <form onSubmit={handleSaveExperiment} className="flex gap-4 mb-8 bg-slate-50 p-5 rounded-3xl border-2 border-slate-100">
              <input type="text" placeholder="Name this configuration..." className="flex-1 px-6 py-3 border-2 border-slate-200 rounded-2xl focus:border-emerald-500 outline-none transition-all font-bold text-slate-700" value={newExpName} onChange={(e) => setNewExpName(e.target.value)} />
              <button type="submit" className="px-8 py-3 bg-slate-900 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-lg">Save State</button>
            </form>
            
            <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Archived States</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {savedExperiments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                  <div className="text-6xl mb-4 grayscale opacity-50">📁</div>
                  <h3 className="font-bold text-slate-700 text-xl">No states saved</h3>
                  <p className="text-slate-500 text-center mt-2 max-w-sm font-medium">Create a simulation in the main workspace and save it here.</p>
                </div>
              ) : (
                savedExperiments.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center p-5 bg-white border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:shadow-lg transition-all group">
                    <div>
                      <h4 className="font-black text-slate-800 text-xl">{exp.name}</h4>
                      <p className="text-sm font-bold text-slate-400 mt-1 uppercase tracking-wider">{exp.bodies.length} Bodies &bull; {exp.constraints.length} Joints</p>
                    </div>
                    <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleLoadExperiment(exp)} className="px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md">Load</button>
                      <button onClick={() => handleDeleteExperiment(exp.id)} className="px-4 py-2.5 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-100 transition-all">Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="w-full max-w-[1400px] mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4 z-10 relative">
        <div>
          <h1 className="text-6xl font-black text-slate-900 tracking-tighter drop-shadow-sm">
            Physics Lab<span className="text-blue-600">.</span>
          </h1>
          <p className="text-slate-500 mt-2 font-medium text-lg tracking-wide">Real-time Kinematics & Dynamics Engine</p>
        </div>

        {hasJoined && (
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-white border-2 border-slate-200 shadow-sm h-fit">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]"></div>
            <span className="text-slate-900 font-black tracking-widest uppercase text-sm">Room {roomId}</span>
            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
            <span className={`font-bold text-sm uppercase tracking-widest ${role === 'host' ? 'text-blue-600' : 'text-purple-600'}`}>{role}</span>
          </div>
        )}
      </div>

      {/* FLOATING MAC-STYLE TOOLBAR */}
      {hasJoined && <Toolbar activeTool={activeTool} onSetTool={setActiveTool} onAddShape={handleAddShape} onClear={handleClearCanvas} onToggleGravity={handleToggleGravity} onOpenLibrary={openLibrary} isZeroG={isZeroG} isHost={role === 'host'} />}

      {/* MAIN WORKSPACE */}
      <div className="w-full max-w-[1400px] grid grid-cols-1 lg:grid-cols-4 gap-8 mb-16 relative z-10">
        
        {/* CANVAS AREA (Takes up 3 columns) */}
        <div className="lg:col-span-3 relative w-full aspect-[16/9] border-4 border-white rounded-[2.5rem] overflow-hidden blueprint-grid shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
          {hasJoined && (
            <div className="absolute top-6 left-6 z-20 pointer-events-none">
              <span className="px-4 py-2 bg-white/90 backdrop-blur-md border border-slate-200 rounded-xl text-xs font-black text-slate-800 shadow-lg uppercase tracking-widest">
                Simulation Feed
              </span>
            </div>
          )}
          <div ref={sceneRef} className="w-full h-full cursor-crosshair mix-blend-multiply" />
        </div>

        {/* ANALYTICS PANEL (Takes up 1 column) */}
        <div className="lg:col-span-1 w-full bg-white border-4 border-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] p-8 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Live Telemetry</h3>
          </div>

          {/* HUD STAT CARDS */}
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center shadow-inner">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bodies</p>
              <p ref={hudBodiesRef} className="text-4xl font-black text-slate-900 font-mono tracking-tighter">0</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center shadow-inner">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Joints</p>
              <p ref={hudConstraintsRef} className="text-4xl font-black text-slate-900 font-mono tracking-tighter">0</p>
            </div>
          </div>

          <h2 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Kinetic Energy</h2>
          
          <div className="flex-1 w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickMargin={12} axisLine={false} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(val) => `${val}J`} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.2)', backgroundColor: '#0f172a' }} 
                  labelStyle={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }} 
                  itemStyle={{ color: '#ffffff', fontWeight: '900' }} 
                />
                {/* Replaced standard line with a thicker, glowing line */}
                <Line 
                  type="monotone" 
                  dataKey="energy" 
                  stroke="#3b82f6" 
                  strokeWidth={5} 
                  dot={false} 
                  activeDot={{ r: 8, fill: '#3b82f6', stroke: '#ffffff', strokeWidth: 4 }} 
                  animationDuration={300} 
                  style={{ filter: 'drop-shadow(0px 10px 10px rgba(59, 130, 246, 0.4))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-6 text-center">Cumulative ½mv²</p>
        </div>

      </div>
    </div>
  );
};

export default PhysicsCanvas;