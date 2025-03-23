const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route for the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active rooms and their participants
const rooms = {};
const clients = {};

// Generate a 5-digit alphanumeric room code
function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    
    // Make sure the room code is unique
    do {
        code = '';
        for (let i = 0; i < 5; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    } while (rooms[code]);
    
    return code;
}

// WebSocket connection handling
wss.on('connection', (ws) => {
    const userId = uuidv4();
    clients[userId] = ws;
    
    console.log(`New user connected: ${userId}`);
    
    let userRoom = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'create-room':
                    // Generate a unique room code
                    const roomCode = generateRoomCode();
                    
                    // Create the room
                    rooms[roomCode] = {
                        participants: {}
                    };
                    
                    // Send room code back to creator
                    ws.send(JSON.stringify({
                        type: 'room-created',
                        roomCode: roomCode
                    }));
                    break;
                    
                case 'join-room':
                    const code = data.roomCode;
                    
                    // Check if room exists
                    if (!rooms[code]) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Room does not exist'
                        }));
                        return;
                    }
                    
                    // Add user to room
                    rooms[code].participants[userId] = true;
                    userRoom = code;
                    
                    // Notify all participants about the new user
                    Object.keys(rooms[code].participants).forEach((participantId) => {
                        if (participantId !== userId) {
                            if (clients[participantId]) {
                                clients[participantId].send(JSON.stringify({
                                    type: 'user-joined',
                                    userId: userId
                                }));
                                
                                // Also notify the new user about existing participants
                                ws.send(JSON.stringify({
                                    type: 'user-joined',
                                    userId: participantId
                                }));
                            }
                        }
                    });
                    break;
                    
                case 'leave-room':
                    if (userRoom && rooms[userRoom]) {
                        // Remove user from room
                        delete rooms[userRoom].participants[userId];
                        
                        // Notify other participants
                        Object.keys(rooms[userRoom].participants).forEach((participantId) => {
                            if (clients[participantId]) {
                                clients[participantId].send(JSON.stringify({
                                    type: 'user-left',
                                    userId: userId
                                }));
                            }
                        });
                        
                        // Clean up empty rooms
                        if (Object.keys(rooms[userRoom].participants).length === 0) {
                            delete rooms[userRoom];
                        }
                        
                        userRoom = null;
                    }
                    break;
                    
                case 'offer':
                    if (clients[data.userId]) {
                        clients[data.userId].send(JSON.stringify({
                            type: 'offer',
                            offer: data.offer,
                            userId: userId
                        }));
                    }
                    break;
                    
                case 'answer':
                    if (clients[data.userId]) {
                        clients[data.userId].send(JSON.stringify({
                            type: 'answer',
                            answer: data.answer,
                            userId: userId
                        }));
                    }
                    break;
                    
                case 'ice-candidate':
                    if (clients[data.userId]) {
                        clients[data.userId].send(JSON.stringify({
                            type: 'ice-candidate',
                            candidate: data.candidate,
                            userId: userId
                        }));
                    }
                    break;
                    
                case 'screen-share-started':
                    if (userRoom) {
                        Object.keys(rooms[userRoom].participants).forEach((participantId) => {
                            if (participantId !== userId && clients[participantId]) {
                                clients[participantId].send(JSON.stringify({
                                    type: 'screen-share-started',
                                    userId: userId
                                }));
                            }
                        });
                    }
                    break;
                    
                case 'screen-share-stopped':
                    if (userRoom) {
                        Object.keys(rooms[userRoom].participants).forEach((participantId) => {
                            if (participantId !== userId && clients[participantId]) {
                                clients[participantId].send(JSON.stringify({
                                    type: 'screen-share-stopped',
                                    userId: userId
                                }));
                            }
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log(`User disconnected: ${userId}`);
        
        // Handle user leaving a room
        if (userRoom && rooms[userRoom]) {
            delete rooms[userRoom].participants[userId];
            
            // Notify other participants
            Object.keys(rooms[userRoom].participants).forEach((participantId) => {
                if (clients[participantId]) {
                    clients[participantId].send(JSON.stringify({
                        type: 'user-left',
                        userId: userId
                    }));
                }
            });
            
            // Clean up empty rooms
            if (Object.keys(rooms[userRoom].participants).length === 0) {
                delete rooms[userRoom];
            }
        }
        
        // Clean up client reference
        delete clients[userId];
    });
});

// Start the server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
