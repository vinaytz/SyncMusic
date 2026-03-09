require("dotenv").config()
const express = require('express');
const { WebSocketServer } = require('ws');
const {mp3Upload} = require("./musicUpload")
const app = express();
const server = app.listen(3000, () => console.log('Server running on port 3000'));

// Create the WebSocket Server
const wss = new WebSocketServer({ server });

// This is our "Database" for the session
const rooms = {}; 

wss.on('connection', (ws) => {
    console.log('New device connected');

    ws.on('message', (data) => {
        const message = JSON.parse(data);

        switch (message.type) {                
            case 'CREATE_ROOM':
                const roomKey = Math.random().toString(36).substring(7);
                rooms[roomKey] = {
                    password: message.password,
                    musicUrl: message.musicUrl,
                    clients: new Set([ws]) // Track who is in the room
                };
                ws.roomKey = roomKey; // Store key on the socket itself
                console.log(rooms)
                ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomKey }));
                break;

            case 'JOIN_ROOM':
                console.log("this is room", rooms)
                const room = rooms[message.roomKey];
                console.log(room)
                if (room && room.password === message.password) {
                    room.clients.add(ws);
                    ws.roomKey = message.roomKey;
                    ws.send(JSON.stringify({ type: 'JOIN_SUCCESS', musicUrl: room.musicUrl }));
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Wrong key/password' }));
                }
                break;

            // case 'CONTROL':
            //     // Broadcast the play/pause signal to everyone in the room EXCEPT the sender
            //     const currentRoom = rooms[ws.roomKey];
            //     if (currentRoom) {
            //         currentRoom.clients.forEach(client => {
            //             if (client !== ws && client.readyState === 1) {
            //                 client.send(JSON.stringify({
            //                     type: 'SYNC_CONTROL',
            //                     action: message.action, // 'PLAY' or 'PAUSE'
            //                     time: message.time     // The exact timestamp
            //                 }));
            //             }
            //         });
            //     }
            //     break;
            case 'CONTROL':
    const currentRoom = rooms[ws.roomKey];
    if (currentRoom) {
        currentRoom.clients.forEach(client => {
            if (client !== ws && client.readyState === 1) {
                client.send(JSON.stringify({
                    type: 'SYNC_CONTROL',
                    action: message.action,
                    time: message.time,
                    // Send the server's current high-resolution timestamp
                    serverTime: Date.now() 
                }));
            }
        });
    }
    break;
        }
    });

    // Cleanup when someone leaves
    ws.on('close', () => {
        if (ws.roomKey && rooms[ws.roomKey]) {
            rooms[ws.roomKey].clients.delete(ws);
        }
    });
});

