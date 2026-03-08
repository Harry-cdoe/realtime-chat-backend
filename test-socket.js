import { io } from "socket.io-client";

// Pehle apne Login API se ek valid token le lo
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0NzhkOTJjNS0wMGRjLTRiYWYtYTMyNS0wMTc1NTE4NGNkZWMiLCJzZXNzaW9uSWQiOiJhYWU2ODdhOC02NzcyLTQyNjMtOWI1NS05MGQwZmRmODJlNTEiLCJpYXQiOjE3NzI5NTA3MTksImV4cCI6MTc3Mjk1MTYxOX0.DFT4VWLeg7DwCqv0XROpdNAQ3o-aJX-IK4-bFWOzz9E"; 

const socket = io("http://localhost:3000", {
  auth: { token: TOKEN } // 🔥 Yeh zaroori hai middleware bypass ke liye
});

socket.on("connect", () => {
  console.log("✅ Connected! Socket ID:", socket.id);

  const chatId = "69acf88519f0b518f234962a";

  // 1. Join Room
  socket.emit("join_chat", chatId);
  console.log("📢 Joined chat room:", chatId);

  // 2. Send Message (RabbitMQ + Socket Test)
  socket.emit("send_message", {
    chatId: chatId,
    message: "Hi, testing real-time!ssss"
  });
});

// Real-time messages receive karne ke liye listener
socket.on("new_message", (msg) => {
  console.log("📥 Realtime message received:", msg);
});

// Error handling (Auth failure check)
socket.on("connect_error", (err) => {
  console.error("❌ Connection failed:", err.message);
});
