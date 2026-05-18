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
            // --- THE FIX FOR JOINTS AND SPRINGS IS HERE ---
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
                  spawnConstraintLocal(constraintData); // Create instantly!
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
  
  // --- LOCAL SPAWN FUNCTIONS ---
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
      if (data.type === 'spring') { options.stiffness = 0.02; options.render = { type: 'line', strokeStyle: '#FF2D55', lineWidth: 4 }; } 
      else { options.stiffness = 1; options.render = { type: 'line', strokeStyle: '#5856D6', lineWidth: 6 }; }
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
    <div className="flex flex-col items-center pt-8 min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-blue-200 px-4">
      {!hasJoined && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-sm">
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Join a Lab</h2>
            <p className="text-slate-500 mb-6 text-sm">Enter a Room ID to collaborate.</p>
            <form onSubmit={handleJoinRoom} className="flex flex-col gap-4">
              <input type="text" placeholder="e.g., lab-101" className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/50 outline-none" value={roomId} onChange={(e) => setRoomId(e.target.value)} autoFocus />
              <button type="submit" className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all active:scale-95">Enter Workspace</button>
            </form>
          </div>
        </div>
      )}

      {isLibraryOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">Experiment Library</h2>
              <button onClick={() => setIsLibraryOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-3xl">&times;</button>
            </div>
            <form onSubmit={handleSaveExperiment} className="flex gap-4 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <input type="text" placeholder="Name your experiment (e.g., Catapult V1)" className="flex-1 px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/50 outline-none" value={newExpName} onChange={(e) => setNewExpName(e.target.value)} />
              <button type="submit" className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all shadow-sm">Save Lab</button>
            </form>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Saved Templates</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {savedExperiments.length === 0 ? (
                <p className="text-slate-500 text-center italic mt-10">No experiments saved yet. Build something and save it!</p>
              ) : (
                savedExperiments.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-blue-300 transition-colors">
                    <div>
                      <h4 className="font-bold text-slate-800">{exp.name}</h4>
                      <p className="text-xs text-slate-500">{exp.bodies.length} Bodies &bull; {exp.constraints.length} Joints</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleLoadExperiment(exp)} className="px-4 py-2 bg-blue-50 text-blue-600 font-semibold rounded-lg hover:bg-blue-100 transition-colors">Load</button>
                      <button onClick={() => handleDeleteExperiment(exp.id)} className="px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors">Delete</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-[1200px] mb-4">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">VIRTUAL-LAB Workspace</h1>
        {hasJoined && <p className="text-blue-600 font-bold mt-2 text-sm uppercase">ROOM: {roomId} &bull; ROLE: {role ? role : 'CONNECTING...'}</p>}
      </div>

      {hasJoined && (
        <div className="w-full max-w-[1200px] mb-4 z-20">
          <Toolbar activeTool={activeTool} onSetTool={setActiveTool} onAddShape={handleAddShape} onClear={handleClearCanvas} onToggleGravity={handleToggleGravity} onOpenLibrary={openLibrary} isZeroG={isZeroG} isHost={role === 'host'} />
        </div>
      )}

      <div className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        <div className="lg:col-span-2 relative w-full aspect-[3/2] border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-sm">
          {hasJoined && (
            <div className="absolute bottom-4 left-4 z-20 bg-white/85 backdrop-blur-md border border-slate-200/50 rounded-xl px-4 py-3 shadow-lg flex flex-col gap-2 min-w-[100px] pointer-events-none">
              <div className="flex justify-between items-center gap-4"><span className="text-[10px] font-bold text-slate-400 uppercase">Bodies</span><span ref={hudBodiesRef} className="text-base font-black text-slate-800 font-mono">0</span></div>
              <div className="w-full h-px bg-slate-100"></div>
              <div className="flex justify-between items-center gap-4"><span className="text-[10px] font-bold text-slate-400 uppercase">Joints</span><span ref={hudConstraintsRef} className="text-base font-black text-slate-800 font-mono">0</span></div>
            </div>
          )}
          <div ref={sceneRef} className="w-full h-full" />
        </div>

        <div className="lg:col-span-1 w-full bg-white border border-slate-200 rounded-3xl shadow-sm p-6 flex flex-col">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Live Analytics</h3>
          <h2 className="text-xl font-extrabold text-slate-800 mb-6">Total Kinetic Energy</h2>
          
          <div className="flex-1 w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} tickMargin={10} />
                <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(val) => `${val}J`} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} labelStyle={{ color: '#64748b', fontSize: '12px' }} itemStyle={{ color: '#0f172a', fontWeight: 'bold' }} />
                <Line type="monotone" dataKey="energy" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} animationDuration={300} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-4 text-center">Tracking cumulative ½mv² of all dynamic bodies.</p>
        </div>
      </div>
    </div>
  );
};

export default PhysicsCanvas;