const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

// Create Express app and HTTP server
const app = express();
app.use(cors());
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active rooms and their participants
const rooms = new Map();

// Generate a random 5-character room code
function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  
  // Keep generating until we get a unique code
  do {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
  } while (rooms.has(code));
  
  return code;
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Handle incoming messages
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data.type);
      
      switch (data.type) {
        case 'create-room':
          const roomCode = generateRoomCode();
          rooms.set(roomCode, new Map());
          
          // Add user to room
          const userMap = rooms.get(roomCode);
          userMap.set(data.userId, ws);
          
          // Set user's room code
          ws.roomCode = roomCode;
          ws.userId = data.userId;
          
          // Send room created confirmation
          ws.send(JSON.stringify({
            type: 'room-created',
            roomCode: roomCode
          }));
          break;
          
        case 'join-room':
          const roomToJoin = rooms.get(data.roomCode);
          
          if (!roomToJoin) {
            ws.send(JSON.stringify({
              type: 'room-error',
              error: 'Room not found'
            }));
            return;
          }
          
          // Add user to room
          roomToJoin.set(data.userId, ws);
          
          // Set user's room code
          ws.roomCode = data.roomCode;
          ws.userId = data.userId;
          
          // Notify all participants about the new user
          roomToJoin.forEach((clientWs, clientId) => {
            if (clientId !== data.userId) {
              clientWs.send(JSON.stringify({
                type: 'new-user',
                userId: data.userId
              }));
              
              // Notify the new user about existing participants
              ws.send(JSON.stringify({
                type: 'new-user',
                userId: clientId
              }));
            }
          });
          
          // Confirm joining
          ws.send(JSON.stringify({
            type: 'room-joined',
            roomCode: data.roomCode
          }));
          break;
          
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // Forward signaling messages to the target user
          const targetRoom = rooms.get(ws.roomCode);
          if (targetRoom && targetRoom.has(data.targetUserId)) {
            const targetWs = targetRoom.get(data.targetUserId);
            targetWs.send(message.toString());
          }
          break;
          
        case 'leave-room':
          handleUserLeaving(ws);
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });
  
  // Handle disconnections
  ws.on('close', () => {
    console.log('Client disconnected');
    handleUserLeaving(ws);
  });
  
  function handleUserLeaving(ws) {
    if (ws.roomCode && ws.userId) {
      const room = rooms.get(ws.roomCode);
      
      if (room) {
        // Remove user from room
        room.delete(ws.userId);
        
        // Notify other participants
        room.forEach((clientWs) => {
          clientWs.send(JSON.stringify({
            type: 'user-left',
            userId: ws.userId
          }));
        });
        
        // If room is empty, remove it
        if (room.size === 0) {
          rooms.delete(ws.roomCode);
          console.log(`Room ${ws.roomCode} deleted (empty)`);
        }
      }
    }
  }
});

// Add a simple status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'Signaling server running',
    activeRooms: rooms.size,
    clients: wss.clients.size
  });
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
