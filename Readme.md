# 🧪 VIRTUAL-LAB: Real-Time Collaborative Physics Sandbox

Virtual Lab is a full-stack, real-time multiplayer physics engine designed for interactive education. It allows multiple users to join a shared workspace, spawn physics bodies, create constraints, and view live telemetry data synchronized with zero latency. 

Built with a Client-Host authoritative architecture, this application ensures stable physics calculations while allowing seamless collaborative experimentation.

---

## ✨ Key Features

* **Real-Time Multiplayer (Client-Host Sync):** Built on WebSockets. The first user to join a room becomes the **Host** (authoritative physics simulator), while subsequent users become **Guests** who can interact seamlessly with the Host's world.
* **Advanced Physics Engine:** Powered by `Matter.js` for highly accurate 60fps rigid-body collisions, velocity tracking, and mass calculations.
* **Interactive Tools & Constraints:** Users can spawn varied masses (Anvils, Boxes, Spheres) and connect them dynamically using rigid **Joints** or elastic **Springs**.
* **Live Analytics Dashboard:** Calculates the total Kinetic Energy ($KE = \frac{1}{2}mv^2$) of the system in real-time, graphed dynamically using `Recharts`.
* **Persistent Experiment Library:** Fully integrated with **MongoDB**. Users can save complex layouts, browse the database gallery, and instantly load or delete templates across all connected clients.
* **Environment Controls:** Host-exclusive permissions to wipe the canvas or toggle "Zero-G" (zero gravity) environments.
* **Modern UI/UX:** Built with Tailwind CSS v4 featuring a frosted-glass aesthetic, responsive layouts, and an unobtrusive heads-up display (HUD).

---

## 🛠️ Tech Stack

* **Frontend:** React, Vite, Tailwind CSS (v4), Recharts
* **Backend:** Node.js, Express, Socket.io, Mongoose
* **Physics Engine:** Matter.js
* **Database:** MongoDB
* **DevOps:** Docker, Docker Compose, Nginx

---

## 🚀 Running the Project

You can run this project in two ways: using **Docker** (easiest, recommended for production) or **Locally** (recommended for active development).

### Method 1: Running with Docker (Recommended)
This method automatically installs everything, sets up the MongoDB database, and serves the app via Nginx. You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed.

1. Ensure Docker Desktop is running on your machine.
2. Open a terminal in the root `virtual-lab` folder.
3. Run the following command to build and start all containers:
   ```bash
   docker-compose up --build
Open your browser and navigate to: http://localhost:8080

(To stop the server, press Ctrl + C in the terminal, or run docker-compose down to clean up the containers).

Method 2: Manual Local Development (npm run dev)
If you want to edit the code and see live updates, you should run the frontend and backend manually. You must have Node.js and a local instance of MongoDB running.

Step 1: Start the Backend server
Open a terminal and navigate to the backend folder:

Bash
cd backend
Install the backend dependencies:

Bash
npm install
Start the Node.js server:

Bash
node src/server.js
You should see 🚀 Virtual Lab Server running on port 4000 and 📦 MongoDB Connected Successfully! in the terminal.

Step 2: Start the Frontend React app
Open a new, separate terminal window and navigate to the frontend folder:

Bash
cd frontend
Install the frontend dependencies:

Bash
npm install
Start the Vite development server:

Bash
npm run dev
Open your browser to the URL provided by Vite (typically http://localhost:5173).

📖 How to Use the App
Join a Room: Enter a room name (e.g., test-lab). The first person to enter becomes the Host.

Spawn Objects: Use the top toolbar to spawn Boxes, Circles, or Heavy Anvils.

Connect Objects: Select the Joint or Spring tool, click one object, and then click a second object to link them together.

Library: Click the 📚 Library button to save your current layout to the MongoDB database, or load a previously saved experiment.

Collaborate: Open a second browser tab, join the exact same room name, and watch your movements sync in real-time as a Guest!