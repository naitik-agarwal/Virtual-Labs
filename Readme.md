# VIRTUAL-LAB

A collaborative, real-time 2D physics sandbox — a "Digital Twin" environment for university-level physics and engineering education.

[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Matter.js](https://img.shields.io/badge/Matter.js-Physics-orange?style=flat-square)](https://brm.io/matter-js/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-Real--Time-010101?style=flat-square&logo=socketdotio)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [How the Physics Sync Works](#how-the-physics-sync-works)
- [API Reference](#api-reference)
- [Contributing](#contributing)

---

## Overview

Teaching physics and engineering online is typically limited to static videos and passive text — formats that fail to build intuition for dynamic, interactive systems.

VIRTUAL-LAB addresses this with a shared, high-fidelity physics workspace where multiple users can simultaneously build machines, test structural integrity, and observe real-time forces acting on objects. The platform bridges the gap between theoretical equations and physical reality through hands-on, collaborative experimentation.

The key architectural challenge: keeping the Matter.js physics simulation state perfectly synchronized across all connected clients with minimal latency, while allowing concurrent user interaction without state conflicts. This is solved by an Agent Middleware layer running on the Express/Socket.io backend that acts as the single source of truth for the simulation state.

---

## System Architecture

```
+---------------------------+        +---------------------------+
|     Client A (React)      |        |     Client B (React)      |
|                           |        |                           |
|  Matter.js (local render) |        |  Matter.js (local render) |
|  Physics Canvas           |        |  Physics Canvas           |
|  Analytics Dashboard      |        |  Analytics Dashboard      |
+------------|--|-----------+        +------------|--|-----------+
             |  ^                                 |  ^
    emit     |  | receive delta              emit |  | receive delta
             v  |                                 v  |
+------------------------------------------------------------+
|               Node.js + Express Backend                    |
|                                                            |
|   Socket.io Agent Middleware                               |
|   - Receives physics deltas from any client                |
|   - Resolves state conflicts (last-writer-wins / merge)    |
|   - Broadcasts authoritative state to all room members     |
|                                                            |
|   Room Engine                                              |
|   - Manages room creation, join, and membership            |
|   - Namespaces: one Socket.io room per lab session         |
|                                                            |
|   REST API (Express)                                       |
|   - Experiment Library CRUD                                |
|   - User auth and session management                       |
|                                                            |
+----------------------------|---------------------------------+
                             |
                    +--------v--------+
                    |    MongoDB      |
                    | - Experiments   |
                    | - Lab Templates |
                    | - User accounts |
                    +-----------------+
```

---

## Features

### Interactive Physics Canvas

A web-based workspace where users drag, drop, and configure physical bodies — rigid shapes, materials, and masses — directly in the browser. Built on Matter.js, a full-featured 2D rigid body physics engine, the canvas handles collision detection, gravity, and constraint resolution in real time.

### Multi-User Room Engine

Multiple users can join the same lab session and interact with the same simulation simultaneously. The backend Room Engine manages Socket.io namespaces (one per session), ensuring physics state is synchronized across all clients with conflict resolution built into the Agent Middleware.

### Physics Constraint System

A toolset for creating mechanical connections between bodies: ropes, springs, pivots, and motorized joints. These are implemented as Matter.js Constraint objects and synchronized across clients as part of the physics delta payload.

### Real-Time Analytics Dashboard

An integrated panel that visualizes live physics data — velocity vectors, kinetic energy over time, and net force arrows — rendered using Recharts. The dashboard updates on every physics tick, giving students quantitative insight alongside the visual simulation.

### Experiment Library

A gallery view where users can browse, save, share, and load pre-configured physics scenarios ("lab templates"). Templates are stored in MongoDB and loaded via the REST API, allowing instructors to prepare experiments for classroom assignments.

### Agent Middleware (Physics Sync Layer)

A high-frequency synchronization layer that receives compact physics state deltas from clients, resolves conflicts, and re-broadcasts the authoritative state. By transmitting only changed object properties (position, velocity, angle) rather than the full world state, the middleware minimizes network payload per tick.

---

## Tech Stack

| Layer               | Technology         | Role                             |
| ------------------- | ------------------ | -------------------------------- |
| Frontend framework  | React 18 (Vite)    | Component rendering, UI state    |
| Physics engine      | Matter.js          | 2D rigid body simulation         |
| Styling             | Tailwind CSS       | Utility-first UI styling         |
| Data visualization  | Recharts           | Live analytics charts            |
| Real-time transport | Socket.io (client) | Physics delta emit/receive       |
| Backend runtime     | Node.js + Express  | REST API and WebSocket server    |
| Real-time server    | Socket.io (server) | Room management, state broadcast |
| Database            | MongoDB            | Experiment storage, user data    |

---

## Project Structure

```
Virtual-Labs/
├── backend/
│   └── src/
│       ├── server.js           # Express app + Socket.io server entry point
│       ├── package.json        # Backend dependencies
│       └── package-lock.json
│
├── frontend/
│   ├── public/                 # Static assets
│   ├── sockets/                # Socket.io client event handlers
│   └── src/
│       ├── assets/             # Images and static resources
│       ├── components/         # Reusable React UI components
│       │   ├── PhysicsCanvas/  # Matter.js canvas wrapper
│       │   ├── Toolbar/        # Body/constraint creation tools
│       │   ├── Dashboard/      # Real-time analytics panel
│       │   └── ExperimentLib/  # Gallery and template loader
│       ├── physics/            # Matter.js engine setup and world config
│       ├── App.jsx             # Root component, router, room join logic
│       ├── App.css
│       ├── main.jsx            # React entry point
│       ├── index.css
│       ├── index.html
│       ├── vite.config.js
│       ├── tailwind.config.js
│       ├── postcss.config.js
│       └── eslint.config.js
│
├── .gitignore
├── package.json                # Root-level scripts (optional monorepo tooling)
└── README.md
```

---

## Prerequisites

- Node.js 18 or higher
- npm 9 or higher
- MongoDB Atlas account (free tier works) or a local MongoDB instance

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Iam-6-Feet/Virtual-Labs.git
cd Virtual-Labs
```

### 2. Backend setup

```bash
cd backend

# Install dependencies
npm install

# Create your environment file
cp .env.example .env
# Edit .env with your MongoDB URI and port (see Environment Variables below)

# Start the server
node src/server.js
```

The backend will start on `http://localhost:5000` by default.

### 3. Frontend setup

Open a new terminal from the project root:

```bash
cd frontend

# Install dependencies
npm install

# Start the Vite dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### 4. Open a second browser tab or window

Navigate both tabs to `http://localhost:5173`, join the same room name, and both clients will share the live physics simulation.

---

## Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server
PORT=5000

# Database
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/virtuallabs

# CORS (set to your frontend URL)
CLIENT_ORIGIN=http://localhost:5173
```

> Never commit your `.env` file. It is listed in `.gitignore`.

---

## How the Physics Sync Works

VIRTUAL-LAB uses a **delta-based synchronization** model rather than broadcasting the full Matter.js world state on every tick. This is the core engineering challenge of the project.

```
Client emits delta:
{
  roomId: "lab-101",
  bodies: [
    { id: "box-1", x: 340.2, y: 210.5, angle: 0.12, vx: 2.1, vy: -0.5 }
  ],
  constraints: [
    { id: "rope-1", bodyAId: "box-1", bodyBId: "anchor-1" }
  ]
}
```

The backend Agent Middleware on `server.js`:

1. Receives the delta on a named Socket.io event (e.g., `physics:update`).
2. Merges the delta into the room's authoritative state object.
3. Broadcasts the merged state to all other members of the room via `socket.to(roomId).emit('physics:state', mergedState)`.

Clients that receive the broadcast apply the authoritative positions directly to their local Matter.js bodies using `Matter.Body.setPosition()` and `Matter.Body.setVelocity()`, keeping all instances in sync.

This architecture makes the **server the single source of truth** — clients are renderers, not simulators. Conflicts (two users moving the same body simultaneously) are resolved by last-writer-wins at the server merge step.

---

## API Reference

All REST endpoints are served from `http://localhost:5000/api`.

| Method   | Endpoint               | Description                          |
| -------- | ---------------------- | ------------------------------------ |
| `GET`    | `/api/experiments`     | Fetch all saved experiment templates |
| `GET`    | `/api/experiments/:id` | Fetch a single experiment by ID      |
| `POST`   | `/api/experiments`     | Save a new experiment template       |
| `PUT`    | `/api/experiments/:id` | Update an existing experiment        |
| `DELETE` | `/api/experiments/:id` | Delete an experiment                 |

Socket.io events:

| Event            | Direction       | Payload                  | Description                               |
| ---------------- | --------------- | ------------------------ | ----------------------------------------- |
| `room:join`      | Client → Server | `{ roomId, userId }`     | Join a collaborative lab session          |
| `room:leave`     | Client → Server | `{ roomId }`             | Leave a session                           |
| `physics:update` | Client → Server | Delta object (see above) | Broadcast a physics state change          |
| `physics:state`  | Server → Client | Merged state object      | Receive the authoritative world state     |
| `room:users`     | Server → Client | `{ users: [...] }`       | List of currently connected users in room |

---

## Contributing

1. Fork the repository and create a feature branch: `git checkout -b feat/your-feature`
2. Make focused, well-described commits.
3. Ensure the frontend lints cleanly: `npm run lint` in the `frontend/` directory.
4. Open a pull request against `main` with a description of what changed and why.

---
