require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// Define the Experiment Schema
const experimentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  bodies: { type: Array, required: true, default: [] },
  constraints: { type: Array, required: true, default: [] },
  createdAt: { type: Date, default: Date.now }
});
const Experiment = mongoose.model('Experiment', experimentSchema);

const app = express();
app.use(cors());

app.get('/api/health', (req, res) => {
  res.json({ status: 'VIRTUAL-LAB Backend is running with MongoDB' });
});

const server = http.createServer(app);

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/virtual-lab';
mongoose.connect(MONGO_URI)
  .then(() => console.log('📦 MongoDB Connected Successfully!'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const activeRooms = {};

io.on('connection', (socket) => {
  console.log(`⚡ New user connected: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    if (!activeRooms[roomId]) {
      activeRooms[roomId] = { host: socket.id, guests: [] };
      socket.emit('role-assigned', { role: 'host', roomId });
    } else {
      activeRooms[roomId].guests.push(socket.id);
      socket.emit('role-assigned', { role: 'guest', roomId });
    }
    socket.roomId = roomId; 
  });

  socket.on('physics-sync', (physicsState) => {
    if (activeRooms[socket.roomId] && activeRooms[socket.roomId].host === socket.id) {
      socket.to(socket.roomId).emit('sync-update', physicsState);
    }
  });

  socket.on('spawn-shape', (shapeData) => {
    if (socket.roomId) io.to(socket.roomId).emit('shape-spawned', shapeData);
  });
  
  socket.on('spawn-constraint', (constraintData) => {
    if (socket.roomId) io.to(socket.roomId).emit('constraint-spawned', constraintData);
  });
  
  socket.on('clear-canvas', () => {
    if (socket.roomId && activeRooms[socket.roomId] && activeRooms[socket.roomId].host === socket.id) {
      io.to(socket.roomId).emit('canvas-cleared');
    }
  });
  
  socket.on('update-environment', (envData) => {
    if (socket.roomId && activeRooms[socket.roomId] && activeRooms[socket.roomId].host === socket.id) {
      socket.to(socket.roomId).emit('environment-updated', envData);
    }
  });

  socket.on('guest-grab', (data) => { if (socket.roomId && activeRooms[socket.roomId]) io.to(activeRooms[socket.roomId].host).emit('host-apply-guest-grab', data); });
  socket.on('guest-drag', (dragData) => { if (socket.roomId && activeRooms[socket.roomId]) io.to(activeRooms[socket.roomId].host).emit('host-apply-guest-drag', dragData); });
  socket.on('guest-drop', (data) => { if (socket.roomId && activeRooms[socket.roomId]) io.to(activeRooms[socket.roomId].host).emit('host-apply-guest-drop', data); });

  socket.on('request-initial-state', () => {
    const room = activeRooms[socket.roomId];
    if (room && room.host) io.to(room.host).emit('provide-initial-state', socket.id);
  });

  socket.on('initial-state-response', (data) => {
    io.to(data.targetId).emit('sync-initial-state', { bodies: data.bodies, constraints: data.constraints });
  });

  // --- MONGODB EXPERIMENT LIBRARY ---
  socket.on('request-experiments', async () => {
    try {
      const savedLabs = await Experiment.find().sort({ createdAt: -1 });
      const formattedLabs = savedLabs.map(exp => ({ id: exp._id.toString(), name: exp.name, bodies: exp.bodies, constraints: exp.constraints }));
      socket.emit('experiments-list', formattedLabs);
    } catch (err) { console.error(err); }
  });

  socket.on('save-experiment', async (data) => {
    try {
      const newExp = new Experiment({ name: data.name, bodies: data.bodies, constraints: data.constraints });
      await newExp.save();
      console.log(`💾 Saved new lab to DB: ${data.name}`);
      const updatedLabs = await Experiment.find().sort({ createdAt: -1 });
      const formattedLabs = updatedLabs.map(exp => ({ id: exp._id.toString(), name: exp.name, bodies: exp.bodies, constraints: exp.constraints }));
      io.emit('experiments-list', formattedLabs);
    } catch (err) { console.error(err); }
  });

  socket.on('trigger-load-experiment', (exp) => {
    if (socket.roomId && activeRooms[socket.roomId].host === socket.id) {
      io.to(socket.roomId).emit('canvas-cleared');
      setTimeout(() => { io.to(socket.roomId).emit('sync-initial-state', { bodies: exp.bodies, constraints: exp.constraints }); }, 100);
    }
  });

  socket.on('delete-experiment', async (id) => {
    try {
      await Experiment.findByIdAndDelete(id);
      console.log(`🗑️ Deleted lab from DB: ${id}`);
      const updatedLabs = await Experiment.find().sort({ createdAt: -1 });
      const formattedLabs = updatedLabs.map(exp => ({ id: exp._id.toString(), name: exp.name, bodies: exp.bodies, constraints: exp.constraints }));
      io.emit('experiments-list', formattedLabs);
    } catch (err) { console.error(err); }
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && activeRooms[roomId]) {
      const room = activeRooms[roomId];
      if (room.host === socket.id) {
        if (room.guests.length > 0) {
          const newHost = room.guests.shift();
          room.host = newHost;
          io.to(newHost).emit('role-assigned', { role: 'host', roomId });
        } else { delete activeRooms[roomId]; }
      } else {
        room.guests = room.guests.filter(id => id !== socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Virtual Lab Server running on port ${PORT}`);
});