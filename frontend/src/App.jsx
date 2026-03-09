import React, { useState, useEffect, useRef } from 'react';

const MusicRoom = () => {
  const [roomKey, setRoomKey] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [status, setStatus] = useState('Disconnected');

  // Refs: These don't trigger re-renders, perfect for "heavy" objects
  const socketRef = useRef(null);
  const audioRef = useRef(new Audio());

  useEffect(() => {
    // 1. Initialize WebSocket Connection
socketRef.current = new WebSocket('wss://syncmusic-production.up.railway.app/');
    socketRef.current.onopen = () => setStatus('Connected to Server');

    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'ROOM_CREATED':
          setRoomKey(data.roomKey);
          setIsJoined(true);
          console.log(data.roomKey)
          break;

        case 'JOIN_SUCCESS':
          audioRef.current.src = data.musicUrl;
          setIsJoined(true);
          break;

        // case 'SYNC_CONTROL':
        //   // Critical: Sync time first, then play/pause
        //   audioRef.current.currentTime = data.time;
        //   if (data.action === 'PLAY') audioRef.current.play();
        //   if (data.action === 'PAUSE') audioRef.current.pause();
        //   break;

        case 'SYNC_CONTROL': {
    const { action, time, serverTime } = data;
    
    // 1. Calculate how long the message took to arrive
    // Note: This is a simple version. Pro apps do a "ping" to sync clocks.
    const delayInMs = Date.now() - serverTime;
    const delayInSeconds = delayInMs / 1000;

    if (action === 'PLAY') {
        // 2. Adjust the audio position to account for the transit time
        // If the message took 0.2s to arrive, we should start 0.2s further into the song
        audioRef.current.currentTime = time + delayInSeconds;
        audioRef.current.play();
    } else if (action === 'PAUSE') {
        // For pause, we just snap to the exact time the sender paused at
        audioRef.current.currentTime = time;
        audioRef.current.pause();
    }
    break;
}

        case 'ERROR':
          alert(data.message);
          break;
          
        default: break;
      }
    };

    // Cleanup on unmount
    return () => {
      socketRef.current.close();
      audioRef.current.pause();
    };
  }, []);

  // --- Handlers ---

  const createRoom = () => {
    // In a real app, upload to ImageKit first, then get this URL
    const demoUrl = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; 
    
    socketRef.current.send(JSON.stringify({
      type: 'CREATE_ROOM',
      password: '123', // Hardcoded for learning
      musicUrl: demoUrl
    }));
  };

  const joinRoom = () => {
    socketRef.current.send(JSON.stringify({
      type: 'JOIN_ROOM',
      roomKey: inputKey,
      password: '123'
    }));
  };

  const handleTogglePlay = () => {
    const isPaused = audioRef.current.paused;
    const action = isPaused ? 'PLAY' : 'PAUSE';
    
    // 1. Update local UI immediately for responsiveness
    if (isPaused) audioRef.current.play();
    else audioRef.current.pause();

    // 2. Inform the server to sync everyone else
    socketRef.current.send(JSON.stringify({
      type: 'CONTROL',
      action: action,
      time: audioRef.current.currentTime
    }));
  };

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
          <button onClick={handleTogglePlay} style={{ fontSize: '20px', padding: '10px 20px' }}>
            Play / Pause
          </button>
          <p>Tip: Open this in two tabs to see the sync!</p>
        </div>
      )}
    </div>
  );
};

export default MusicRoom;