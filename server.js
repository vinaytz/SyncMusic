require("dotenv").config()
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const { mp3Upload } = require("./musicUpload");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// ─── Spotify: Client Credentials token cache ───
let spotifyToken = null;
let tokenExpiresAt = 0;

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < tokenExpiresAt) return spotifyToken;

    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(
                process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
            ).toString('base64')
        },
        body: 'grant_type=client_credentials'
    });

    const data = await res.json();

    if (!data.access_token) {
        console.error('Spotify token error:', data);
        throw new Error('Failed to get Spotify token');
    }

    spotifyToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
}

// ─── REST: Search Spotify tracks ───
app.get('/spotify/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Missing query param ?q=' });

        let token = await getSpotifyToken();
        let spotifyRes = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        // If token expired mid-session, clear cache and retry once
        if (spotifyRes.status === 401) {
            spotifyToken = null;
            tokenExpiresAt = 0;
            token = await getSpotifyToken();
            spotifyRes = await fetch(
                `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
        }

        const data = await spotifyRes.json();

        if (data.error) {
            console.error('Spotify API error:', data.error);
            return res.status(data.error.status || 500).json({ error: data.error.message });
        }

        const tracks = (data.tracks?.items || []).map(t => ({
            id: t.id,
            name: t.name,
            artist: t.artists.map(a => a.name).join(', '),
            album: t.album.name,
            cover: t.album.images[1]?.url || t.album.images[0]?.url,
            previewUrl: t.preview_url,
            spotifyUrl: t.external_urls.spotify,
        }));

        res.json({ tracks });
    } catch (err) {
        console.error('Spotify search error:', err.message);
        res.status(500).json({ error: 'Spotify search failed' });
    }
});

// ─── REST: Upload music file to ImageKit ───
app.post('/upload', upload.single('music'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file provided' });

        const base64 = req.file.buffer.toString('base64');
        const url = await mp3Upload(base64, req.file.originalname);

        if (!url) return res.status(500).json({ error: 'Upload failed' });
        res.json({ url });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

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
            case 'PING':
                ws.send(JSON.stringify({
                    type: 'PONG',
                    clientTime: message.clientTime,
                    serverTime: Date.now()
                }));
                break;

            case 'CREATE_ROOM':
                const roomKey = Math.random().toString(36).substring(7);
                rooms[roomKey] = {
                    password: message.password,
                    musicUrl: message.musicUrl,
                    pauseTime: 0,
                    isPlaying: false,
                    playStartServerTime: 0,
                    playStartPosition: 0,
                    clients: new Set([ws])
                };
                ws.roomKey = roomKey;
                ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomKey }));
                break;

            case 'JOIN_ROOM': {
                const room = rooms[message.roomKey];
                if (room && room.password === message.password) {
                    room.clients.add(ws);
                    ws.roomKey = message.roomKey;
                    const joinPayload = { type: 'JOIN_SUCCESS', musicUrl: room.musicUrl };
                    if (room.isPlaying && room.playStartServerTime) {
                        const elapsed = (Date.now() - room.playStartServerTime) / 1000;
                        joinPayload.currentTime = room.playStartPosition + elapsed;
                        joinPayload.isPlaying = true;
                    }
                    ws.send(JSON.stringify(joinPayload));
                } else {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Wrong key/password' }));
                }
                break;
            }

            case 'CONTROL': {
                const currentRoom = rooms[ws.roomKey];
                if (!currentRoom) break;

                if (message.action === 'PAUSE') {
                    currentRoom.pauseTime = message.time;
                    currentRoom.isPlaying = false;

                    currentRoom.clients.forEach(client => {
                        if (client.readyState === 1) {
                            client.send(JSON.stringify({
                                type: 'SYNC_CONTROL',
                                action: 'PAUSE',
                                time: currentRoom.pauseTime
                            }));
                        }
                    });
                }

                if (message.action === 'PLAY') {
                    const playFrom = currentRoom.pauseTime || 0;
                    const startAt = Date.now() + 600; // schedule 600ms in the future

                    currentRoom.isPlaying = true;
                    currentRoom.playStartServerTime = startAt;
                    currentRoom.playStartPosition = playFrom;

                    currentRoom.clients.forEach(client => {
                        if (client.readyState === 1) {
                            client.send(JSON.stringify({
                                type: 'SYNC_CONTROL',
                                action: 'PLAY',
                                time: playFrom,
                                startAt
                            }));
                        }
                    });
                }
                break;
            }
        }
    });

    // Cleanup when someone leaves
    ws.on('close', () => {
        if (ws.roomKey && rooms[ws.roomKey]) {
            rooms[ws.roomKey].clients.delete(ws);
        }
    });
});

