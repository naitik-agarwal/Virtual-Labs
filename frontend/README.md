# 🧪 VIRTUAL-LAB: Real-Time Collaborative Physics Sandbox

Virtual Lab is a full-stack, real-time multiplayer physics engine designed for interactive education. It allows multiple users to join a shared workspace, spawn physics bodies, create constraints, and view live telemetry data synchronized with zero latency.

## ✨ Key Features

* **Real-Time Multiplayer (Client-Host Sync):** Built on WebSockets with a custom Host-authoritative architecture. The first user to join a room becomes the Host (running the 60fps physics simulation), while subsequent users become Guests who can interact seamlessly with the Host's world.
* **Advanced Physics Engine:** Powered by `Matter.js` for highly accurate rigid-body collisions, velocity tracking, and mass calculations.
* **Interactive Tools & Constraints:** Users can spawn varied masses (Anvils, Boxes, Spheres) and connect them dynamically using rigid **Joints** or elastic **Springs**.
* **Live Analytics Dashboard:** Calculates the total Kinetic Energy ($KE = \frac{1}{2}mv^2$) of the system in real-time, graphed dynamically using `Recharts`.
* **Persistent Experiment Library:** Fully integrated with **MongoDB**. Users can save complex layouts, browse the database gallery, and instantly load or delete templates across all connected clients.
* **Environment Controls:** Host-exclusive permissions to wipe the canvas or toggle "Zero-G" (zero gravity) environments.
* **Containerized Deployment:** Fully orchestrated using **Docker** for guaranteed "works-on-my-machine" reliability.

## 🛠️ Tech Stack

* **Frontend:** React, Vite, Tailwind CSS (v4), Recharts
* **Backend:** Node.js, Express, Socket.io, Mongoose
* **Physics Engine:** Matter.js
* **Database:** MongoDB
* **DevOps:** Docker, Docker Compose, Nginx

---

## 🚀 Quick Start (Production / Docker)

The easiest way to run this project is using Docker. You do not need Node or MongoDB installed on your machine.

1. Ensure Docker Desktop is running.
2. Open a terminal in the root directory and run:
   ```bash
   docker-compose up --build