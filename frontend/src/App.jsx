import { useState, useEffect, useRef } from 'react';

const MusicRoom = () => {
  const [roomKey, setRoomKey] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Disconnected');

  const socketRef = useRef(null);
  const audioRef = useRef(new Audio());

  useEffect(() => {
    const socket = new WebSocket('wss://syncmusic-production.up.railway.app/');
    socketRef.current = socket;

    socket.onopen = () => setStatus('Connected to Server');

    socket.onmessage = (event) => {
      const { type, ...data } = JSON.parse(event.data);

      switch (type) {
        case 'ROOM_CREATED':
          setRoomKey(data.roomKey);
          setIsJoined(true);
          break;

        case 'JOIN_SUCCESS':
          audioRef.current.src = data.musicUrl;
          setIsJoined(true);
          break;

        case 'SYNC_CONTROL':
          // Server is the source of truth — just obey what it says
          audioRef.current.currentTime = data.time;
          if (data.action === 'PLAY') {
            audioRef.current.play();
            setIsPlaying(true);
          } else {
            audioRef.current.pause();
            setIsPlaying(false);
          }
          break;

        case 'ERROR':
          alert(data.message);
          break;
      }
    };

    return () => {
      socket.close();
      audioRef.current.pause();
    };
  }, []);

  // ─── Send helper ───
  const send = (payload) => {
    const { current: ws } = socketRef;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };

  // ─── Room actions ───
  const createRoom = () => {
    send({
      type: 'CREATE_ROOM',
      password: '123',
      musicUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
    });
  };

  const joinRoom = () => {
    send({ type: 'JOIN_ROOM', roomKey: inputKey, password: '123' });
  };

  // ─── Play / Pause ───
  // FE does NOT touch the audio element here.
  // It only sends a command. The server will broadcast SYNC_CONTROL
  // back to ALL clients (including this one), and that handler above
  // actually plays/pauses the audio — guaranteeing 100% sync.

  const handlePause = () => {
    send({
      type: 'CONTROL',
      action: 'PAUSE',
      time: audioRef.current.currentTime   // send where we paused
    });
  };

  const handlePlay = () => {
    send({
      type: 'CONTROL',
      action: 'PLAY'                        // no time — server uses stored pauseTime
    });
  };

  // ─── UI ───
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Music Sync Demo</h2>
      <p>Status: <strong>{status}</strong></p>

      {!isJoined ? (
        <div>
          <button onClick={createRoom}>Create New Room</button>
          <hr />
          <input
            placeholder="Enter Room Key"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <div>
          <h3>Room: {roomKey || inputKey}</h3>
          <button
            onClick={isPlaying ? handlePause : handlePlay}
            style={{ fontSize: '20px', padding: '10px 20px' }}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <p>Tip: Open this in two tabs to see the sync!</p>
        </div>
      )}
    </div>
  );
};

export default MusicRoom;