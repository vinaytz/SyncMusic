import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Music, Upload, Play, Pause, Radio, Copy, Check, Loader2, Users, LogIn, Plus, Wifi, WifiOff, Search, X, Disc3,
  Volume2, VolumeX, Send, SkipBack, SkipForward, MessageCircle, Youtube
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const API_URL = 'https://syncmusic-production.up.railway.app';
const WS_URL = 'wss://syncmusic-production.up.railway.app/';

export default function App() {
  // ─── State ───
  const [view, setView] = useState('home');       // home | create | join | room
  const [connected, setConnected] = useState(false);
  const [roomKey, setRoomKey] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [songName, setSongName] = useState('');

  // Create room form
  const [password, setPassword] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [musicSource, setMusicSource] = useState('upload'); // 'upload' | 'spotify' | 'youtube'

  // YouTube
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoId, setVideoId] = useState('');
  const [roomType, setRoomType] = useState('audio'); // 'audio' | 'youtube'

  // Spotify search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState(null);

  // Join room form
  const [joinKey, setJoinKey] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  // Advanced features
  const [listenerCount, setListenerCount] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [coverArt, setCoverArt] = useState('');

  // Refs
  const socketRef = useRef(null);
  const audioRef = useRef(new Audio());
  const clockOffsetRef = useRef(0);
  const playTimeoutRef = useRef(null);
  const driftIntervalRef = useRef(null);
  const syncStateRef = useRef({ startAt: 0, playFrom: 0 });
  const canvasRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const chatEndRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const ytReadyRef = useRef(false);
  const ytDriftRef = useRef(null);

  // ─── WebSocket connection + clock sync + auto-reconnect ───
  useEffect(() => {
    audioRef.current.preload = 'auto';
    let socket = null;
    let syncSamples = [];
    let syncResolve = null;
    let resyncTimer = null;
    let heartbeatTimer = null;
    let reconnectTimer = null;
    let intentionalClose = false;

    const sendPing = () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING', clientTime: Date.now() }));
      }
    };

    const startClockSync = () =>
      new Promise((resolve) => {
        syncSamples = [];
        syncResolve = resolve;
        sendPing();
      });

    // ── Drift correction (runs while playing) ──
    const startDriftCorrection = () => {
      stopDriftCorrection();
      driftIntervalRef.current = setInterval(() => {
        const audio = audioRef.current;
        if (!audio || audio.paused) return;
        const { startAt, playFrom } = syncStateRef.current;
        if (!startAt) return;
        const serverNow = Date.now() + clockOffsetRef.current;
        const expectedTime = playFrom + (serverNow - startAt) / 1000;
        const drift = audio.currentTime - expectedTime;
        if (Math.abs(drift) > 0.05) {
          audio.currentTime = expectedTime;
        }
      }, 2000);
    };

    const stopDriftCorrection = () => {
      if (driftIntervalRef.current) {
        clearInterval(driftIntervalRef.current);
        driftIntervalRef.current = null;
      }
    };

    function connect() {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

      socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        startClockSync().then((offset) => {
          clockOffsetRef.current = offset;
        });
        // Re-sync clocks every 10s
        clearInterval(resyncTimer);
        resyncTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            startClockSync().then((offset) => {
              clockOffsetRef.current = offset;
            });
          }
        }, 10_000);
        // Heartbeat every 20s to keep mobile connections alive
        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PING', clientTime: Date.now() }));
          }
        }, 20_000);
      };

      socket.onclose = () => {
        setConnected(false);
        clearInterval(resyncTimer);
        clearInterval(heartbeatTimer);
        // Auto-reconnect unless we intentionally closed
        if (!intentionalClose) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };

      socket.onerror = () => {
        // onclose will fire after this, triggering reconnect
      };

      socket.onmessage = (event) => {
      const { type, ...data } = JSON.parse(event.data);

      switch (type) {
        case 'PONG': {
          const t3 = Date.now();
          const t1 = data.clientTime;
          const t2 = data.serverTime;
          const rtt = t3 - t1;
          const offset = ((t2 - t1) + (t2 - t3)) / 2;
          syncSamples.push({ offset, rtt });
          if (syncSamples.length < 5) {
            setTimeout(sendPing, 50);
          } else if (syncResolve) {
            syncSamples.sort((a, b) => a.rtt - b.rtt);
            syncResolve(syncSamples[0].offset);
            syncResolve = null;
          }
          break;
        }

        case 'ROOM_CREATED':
          setRoomKey(data.roomKey);
          setView('room');
          break;

        case 'JOIN_SUCCESS':
          setSongName(data.songName || data.musicUrl?.split('/').pop().split('?')[0] || 'YouTube Video');
          if (data.coverArt) setCoverArt(data.coverArt);
          if (data.roomType === 'youtube' && data.videoId) {
            setRoomType('youtube');
            setVideoId(data.videoId);
          } else {
            setRoomType('audio');
            audioRef.current.src = data.musicUrl;
          }
          setView('room');
          if (data.isPlaying && data.currentTime != null) {
            if (data.roomType === 'youtube') {
              // YouTube late-join: dispatch event once player is ready
              const waitForYt = () => {
                window.dispatchEvent(new CustomEvent('yt-sync', {
                  detail: { action: 'PLAY', time: data.currentTime, startAt: Date.now() + 500 }
                }));
              };
              setTimeout(waitForYt, 2000);
            } else {
              const audio = audioRef.current;
              const catchUp = () => {
                audio.removeEventListener('canplay', catchUp);
                audio.currentTime = data.currentTime;
                audio.play();
                setIsPlaying(true);
              };
              audio.addEventListener('canplay', catchUp);
            }
          }
          break;

        case 'SYNC_CONTROL': {
          if (playTimeoutRef.current) {
            clearTimeout(playTimeoutRef.current);
            playTimeoutRef.current = null;
          }

          if (data.action === 'PLAY') {
            syncStateRef.current = { startAt: data.startAt, playFrom: data.time };
            const localStart = data.startAt - clockOffsetRef.current;
            const delay = localStart - Date.now();

            audioRef.current.currentTime = data.time;

            if (delay > 0) {
              playTimeoutRef.current = setTimeout(() => {
                audioRef.current.play();
                setIsPlaying(true);
                startDriftCorrection();
              }, delay);
            } else {
              audioRef.current.currentTime = data.time + Math.abs(delay) / 1000;
              audioRef.current.play();
              setIsPlaying(true);
              startDriftCorrection();
            }
          } else {
            stopDriftCorrection();
            audioRef.current.pause();
            audioRef.current.currentTime = data.time;
            setIsPlaying(false);
          }
          break;
        }

        case 'ERROR':
          alert(data.message);
          break;

        case 'LISTENER_COUNT':
          setListenerCount(data.count);
          break;

        case 'CHAT':
          setChatMessages(prev => [...prev.slice(-100), data]);
          break;

        case 'VIDEO_SYNC': {
          if (playTimeoutRef.current) {
            clearTimeout(playTimeoutRef.current);
            playTimeoutRef.current = null;
          }
          // We dispatch a custom event so the room view can react
          window.dispatchEvent(new CustomEvent('yt-sync', { detail: data }));
          break;
        }
      }
    };
    } // end connect()

    connect();

    return () => {
      intentionalClose = true;
      clearInterval(resyncTimer);
      clearInterval(heartbeatTimer);
      clearTimeout(reconnectTimer);
      stopDriftCorrection();
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
      if (socket) socket.close();
      audioRef.current.pause();
    };
  }, []);

  // Reconnect on visibility change (phone wakes up from sleep)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const ws = socketRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          setConnected(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const send = (payload) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
  };

  // ─── YouTube helpers ───
  const parseYoutubeId = (url) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const match = url.match(p);
      if (match) return match[1];
    }
    return '';
  };

  // Load YT IFrame API once
  useEffect(() => {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }, []);

  // ─── Upload & Create Room ───
  const handleCreate = async () => {
    if (!password) return;

    if (musicSource === 'youtube') {
      const vid = parseYoutubeId(youtubeUrl);
      if (!vid) return alert('Invalid YouTube URL');
      setVideoId(vid);
      setRoomType('youtube');
      setSongName('YouTube Video');
      send({ type: 'CREATE_ROOM', password, musicUrl: '', roomType: 'youtube', videoId: vid, songName: 'YouTube Video', coverArt: `https://img.youtube.com/vi/${vid}/hqdefault.jpg` });
      setCoverArt(`https://img.youtube.com/vi/${vid}/hqdefault.jpg`);
      return;
    }

    if (musicSource === 'spotify') {
      // Spotify: use the preview URL directly
      if (!selectedTrack?.previewUrl) return;
      setSongName(`${selectedTrack.name} — ${selectedTrack.artist}`);
      setCoverArt(selectedTrack.cover || '');
      send({ type: 'CREATE_ROOM', password, musicUrl: selectedTrack.previewUrl, songName: `${selectedTrack.name} — ${selectedTrack.artist}`, coverArt: selectedTrack.cover || '' });
      return;
    }

    // Upload: upload file to ImageKit
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('music', file);
      const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
      const { url } = await res.json();
      if (!url) throw new Error('Upload failed');
      setSongName(file.name);
      send({ type: 'CREATE_ROOM', password, musicUrl: url, songName: file.name, coverArt: '' });
    } catch (err) {
      alert('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  // ─── Spotify search ───
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/spotify/search?q=${encodeURIComponent(searchQuery)}`);
      const { tracks } = await res.json();
      setSearchResults(tracks || []);
    } catch {
      alert('Search failed');
    } finally {
      setSearching(false);
    }
  };

  // ─── Join Room ───
  const handleJoin = () => {
    if (!joinKey || !joinPassword) return;
    send({ type: 'JOIN_ROOM', roomKey: joinKey, password: joinPassword });
  };

  // ─── Controls ───
  const handlePlay = () => send({ type: 'CONTROL', action: 'PLAY' });
  const handlePause = () => send({ type: 'CONTROL', action: 'PAUSE', time: audioRef.current.currentTime });
  const handleSeek = (time) => send({ type: 'CONTROL', action: 'SEEK', time });

  const handleVolumeChange = (v) => {
    setVolume(v);
    audioRef.current.volume = v;
    if (v > 0) setMuted(false);
  };

  const toggleMute = () => {
    if (muted) {
      audioRef.current.volume = volume || 0.5;
      setMuted(false);
    } else {
      audioRef.current.volume = 0;
      setMuted(true);
    }
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    send({ type: 'CHAT', text, sender: nickname || 'Anon' });
    setChatInput('');
  };

  // ─── Progress tracking ───
  useEffect(() => {
    const audio = audioRef.current;
    const updateProgress = () => {
      if (audio.duration) {
        setProgress(audio.currentTime);
        setDuration(audio.duration);
      }
    };
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('loadedmetadata', () => setDuration(audio.duration));
    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
    };
  }, []);

  // ─── Audio Visualizer ───
  const initVisualizer = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    const source = ctx.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(ctx.destination);
    sourceNodeRef.current = source;
  }, []);

  const drawVisualizer = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const canvasCtx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        const hue = (i / bufferLength) * 60 + 250;
        canvasCtx.fillStyle = `hsla(${hue}, 80%, 60%, 0.8)`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    };
    draw();
  }, []);

  useEffect(() => {
    if (isPlaying && view === 'room') {
      initVisualizer();
      drawVisualizer();
    } else {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, view, initVisualizer, drawVisualizer]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const copyKey = () => {
    navigator.clipboard.writeText(roomKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (sec) => {
    if (!sec || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Views ───
  if (view === 'room' && roomType === 'youtube') {
    return <YouTubeRoom
      videoId={videoId}
      songName={songName}
      coverArt={coverArt}
      connected={connected}
      roomKey={roomKey || joinKey}
      copyKey={copyKey}
      copied={copied}
      listenerCount={listenerCount}
      chatMessages={chatMessages}
      chatInput={chatInput}
      setChatInput={setChatInput}
      chatOpen={chatOpen}
      setChatOpen={setChatOpen}
      nickname={nickname}
      setNickname={setNickname}
      sendChat={sendChat}
      chatEndRef={chatEndRef}
      send={send}
      clockOffsetRef={clockOffsetRef}
      playTimeoutRef={playTimeoutRef}
      syncStateRef={syncStateRef}
    />;
  }

  if (view === 'room') {
    return (
      <Shell connected={connected}>
        <div className="flex w-full max-w-2xl gap-4 flex-col lg:flex-row">
          {/* Main player card */}
          <Card className="w-full flex-1">
            <CardContent className="flex flex-col items-center gap-4 p-6">
              {/* Room info bar */}
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-full bg-violet-500/10 px-3 py-1">
                    <Radio className="h-3 w-3 text-violet-400 animate-pulse" />
                    <span className="text-xs font-medium text-violet-400">LIVE</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-zinc-500">
                    <Users className="h-3 w-3" />
                    <span>{listenerCount} listening</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-zinc-500">{roomKey || joinKey}</code>
                  <button onClick={copyKey} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
                    {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* Cover art + visualizer */}
              <div className="relative w-full aspect-[2/1] rounded-xl overflow-hidden bg-zinc-900/50">
                {coverArt ? (
                  <img src={coverArt} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-110" />
                ) : null}
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={200}
                  className="relative w-full h-full"
                />
                {!isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="flex flex-col items-center gap-2">
                      {coverArt && <img src={coverArt} alt="" className="h-16 w-16 rounded-lg shadow-lg" />}
                      <p className="text-sm font-medium text-white">{songName || 'Ready to play'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Song name */}
              {songName && (
                <div className="flex items-center gap-2 text-sm text-zinc-300 w-full">
                  <Music className="h-4 w-4 text-violet-400 shrink-0" />
                  <span className="truncate font-medium">{songName}</span>
                </div>
              )}

              {/* Progress bar */}
              <div className="w-full flex flex-col gap-1">
                <div
                  className="relative w-full h-1.5 bg-zinc-800 rounded-full cursor-pointer group"
                  onClick={(e) => {
                    if (!duration) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    handleSeek(pct * duration);
                  }}
                >
                  <div
                    className="absolute top-0 left-0 h-full bg-violet-500 rounded-full transition-all"
                    style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ left: `${duration ? (progress / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>{formatTime(progress)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-3 w-full justify-center">
                <button
                  onClick={() => handleSeek(Math.max(0, progress - 10))}
                  className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipBack className="h-5 w-5" />
                </button>

                <Button
                  variant="primary"
                  size="lg"
                  className="w-14 h-14 rounded-full p-0 flex items-center justify-center"
                  onClick={isPlaying ? handlePause : handlePlay}
                >
                  {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
                </Button>

                <button
                  onClick={() => handleSeek(Math.min(duration || 0, progress + 10))}
                  className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2 w-full">
                <button onClick={toggleMute} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
                  {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-violet-500 cursor-pointer"
                />
              </div>

              <p className="text-[10px] text-zinc-700 text-center">Open in multiple tabs / devices to test sync</p>
            </CardContent>
          </Card>

          {/* Chat panel */}
          <Card className={`w-full lg:w-72 flex flex-col transition-all ${chatOpen ? 'max-h-[500px]' : 'max-h-12 overflow-hidden'}`}>
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="flex items-center gap-2 p-3 text-sm font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <MessageCircle className="h-4 w-4 text-violet-400" />
              Live Chat
              {chatMessages.length > 0 && (
                <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 rounded-full px-2 py-0.5">
                  {chatMessages.length}
                </span>
              )}
            </button>
            {chatOpen && (
              <>
                <div className="flex-1 overflow-y-auto px-3 space-y-2 min-h-[200px] max-h-[350px]">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-zinc-700 text-center py-8">No messages yet</p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium text-violet-400">{msg.sender}: </span>
                      <span className="text-zinc-400">{msg.text}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex gap-2 p-3 border-t border-zinc-800">
                  <Input
                    placeholder={nickname ? 'Message...' : 'Set nickname first'}
                    value={nickname ? chatInput : nickname}
                    onChange={(e) => nickname ? setChatInput(e.target.value) : null}
                    onKeyDown={(e) => e.key === 'Enter' && nickname && sendChat()}
                    className="text-xs h-8"
                  />
                  {!nickname ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 shrink-0"
                      onClick={() => {
                        const name = prompt('Enter your nickname (max 20 chars):');
                        if (name) setNickname(name.slice(0, 20));
                      }}
                    >
                      <Users className="h-3 w-3" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 shrink-0"
                      onClick={sendChat}
                      disabled={!chatInput.trim()}
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      </Shell>
    );
  }

  if (view === 'create') {
    const canCreate = password && connected && !uploading &&
      (musicSource === 'upload' ? !!file : musicSource === 'spotify' ? !!selectedTrack?.previewUrl : !!parseYoutubeId(youtubeUrl));

    return (
      <Shell connected={connected}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-violet-400" /> Create Room</CardTitle>
            <CardDescription>Pick a song and set a password. Share the key with friends.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">

            {/* ── Source tabs ── */}
            <div className="flex rounded-lg bg-zinc-800 p-1 gap-1">
              <button
                onClick={() => { setMusicSource('upload'); setSelectedTrack(null); setYoutubeUrl(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  musicSource === 'upload' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Upload className="h-4 w-4" /> Upload
              </button>
              <button
                onClick={() => { setMusicSource('spotify'); setFile(null); setYoutubeUrl(''); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  musicSource === 'spotify' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Disc3 className="h-4 w-4" /> Spotify
              </button>
              <button
                onClick={() => { setMusicSource('youtube'); setFile(null); setSelectedTrack(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  musicSource === 'youtube' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Youtube className="h-4 w-4" /> YouTube
              </button>
            </div>

            {/* ── Upload tab ── */}
            {musicSource === 'upload' && (
              <label className="group flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 p-6 cursor-pointer hover:border-violet-500/50 transition-colors">
                <Upload className="h-8 w-8 text-zinc-500 group-hover:text-violet-400 transition-colors" />
                <span className="text-sm text-zinc-400">
                  {file ? file.name : 'Click to select an MP3 file'}
                </span>
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files[0])}
                />
              </label>
            )}

            {/* ── Spotify tab ── */}
            {musicSource === 'spotify' && (
              <div className="flex flex-col gap-3">
                {/* Search bar */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Search for a song..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <Button variant="outline" size="icon" onClick={handleSearch} disabled={searching}>
                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Selected track */}
                {selectedTrack && (
                  <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                    <img src={selectedTrack.cover} alt="" className="h-10 w-10 rounded object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{selectedTrack.name}</p>
                      <p className="text-xs text-zinc-400 truncate">{selectedTrack.artist}</p>
                    </div>
                    <button onClick={() => setSelectedTrack(null)} className="text-zinc-500 hover:text-white cursor-pointer">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Results list */}
                {searchResults.length > 0 && !selectedTrack && (
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-800 divide-y divide-zinc-800">
                    {searchResults.map((track) => (
                      <button
                        key={track.id}
                        onClick={() => { setSelectedTrack(track); setSearchResults([]); }}
                        disabled={!track.previewUrl}
                        className={`flex w-full items-center gap-3 p-3 text-left transition-colors ${
                          track.previewUrl
                            ? 'hover:bg-zinc-800 cursor-pointer'
                            : 'opacity-40 cursor-not-allowed'
                        }`}
                      >
                        <img src={track.cover} alt="" className="h-10 w-10 rounded object-cover" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{track.name}</p>
                          <p className="text-xs text-zinc-400 truncate">{track.artist}</p>
                        </div>
                        {!track.previewUrl && (
                          <span className="text-[10px] text-zinc-600 shrink-0">No preview</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {musicSource === 'spotify' && selectedTrack && (
                  <p className="text-xs text-zinc-500 text-center">
                    Spotify free tier provides 30-second preview clips
                  </p>
                )}
              </div>
            )}

            {/* ── YouTube tab ── */}
            {musicSource === 'youtube' && (
              <div className="flex flex-col gap-3">
                <Input
                  placeholder="Paste YouTube video URL..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                />
                {parseYoutubeId(youtubeUrl) && (
                  <div className="rounded-xl overflow-hidden border border-zinc-800">
                    <img
                      src={`https://img.youtube.com/vi/${parseYoutubeId(youtubeUrl)}/hqdefault.jpg`}
                      alt="Video thumbnail"
                      className="w-full aspect-video object-cover"
                    />
                    <div className="flex items-center gap-2 p-3 bg-zinc-900">
                      <Youtube className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-xs text-zinc-400 truncate">Video ID: {parseYoutubeId(youtubeUrl)}</span>
                      <Check className="h-3 w-3 text-emerald-400 ml-auto shrink-0" />
                    </div>
                  </div>
                )}
                <p className="text-xs text-zinc-600 text-center">
                  Everyone loads the video from YouTube — only controls are synced
                </p>
              </div>
            )}

            <Input
              type="password"
              placeholder="Room password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!canCreate}
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : 'Create Room'}
            </Button>

            <Button variant="ghost" onClick={() => setView('home')}>← Back</Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (view === 'join') {
    return (
      <Shell connected={connected}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LogIn className="h-5 w-5 text-violet-400" /> Join Room</CardTitle>
            <CardDescription>Enter the room key and password shared by the host.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              placeholder="Room key"
              value={joinKey}
              onChange={(e) => setJoinKey(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Room password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={handleJoin}
              disabled={!joinKey || !joinPassword || !connected}
            >
              Join Room
            </Button>
            <Button variant="ghost" onClick={() => setView('home')}>← Back</Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // ─── Home ───
  return (
    <Shell connected={connected}>
      <div className="flex flex-col items-center gap-2 mb-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10 mb-2">
          <Music className="h-8 w-8 text-violet-400" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">SyncMusic</h1>
        <p className="text-zinc-400 text-center max-w-xs">
          Listen to music or watch videos together in perfect sync — no matter where you are.
        </p>
      </div>

      <div className="grid w-full max-w-md gap-4">
        <Card
          className="cursor-pointer hover:border-violet-500/40 transition-colors"
          onClick={() => setView('create')}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
              <Plus className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <p className="font-medium text-white">Create a Room</p>
              <p className="text-sm text-zinc-500">Upload a song, Spotify, or YouTube</p>
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-violet-500/40 transition-colors"
          onClick={() => setView('join')}
        >
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
              <Users className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-medium text-white">Join a Room</p>
              <p className="text-sm text-zinc-500">Enter a key to listen with friends</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}

// ─── YouTube Room Component ───
function YouTubeRoom({
  videoId, songName, coverArt, connected, roomKey, copyKey, copied,
  listenerCount, chatMessages, chatInput, setChatInput, chatOpen, setChatOpen,
  nickname, setNickname, sendChat, chatEndRef, send, clockOffsetRef,
  playTimeoutRef, syncStateRef
}) {
  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const driftRef = useRef(null);
  const [ytReady, setYtReady] = useState(false);
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytProgress, setYtProgress] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);

  const formatTime = (sec) => {
    if (!sec || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Init YT player
  useEffect(() => {
    let player = null;

    const create = () => {
      player = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, disablekb: 1 },
        events: {
          onReady: () => {
            playerRef.current = player;
            setYtReady(true);
            setYtDuration(player.getDuration());
          },
          onStateChange: (e) => {
            // just track state locally — actual control comes from WS
            if (e.data === window.YT.PlayerState.PLAYING) setYtPlaying(true);
            else if (e.data === window.YT.PlayerState.PAUSED) setYtPlaying(false);
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      create();
    } else {
      window.onYouTubeIframeAPIReady = create;
    }

    return () => {
      if (player && player.destroy) player.destroy();
      if (driftRef.current) clearInterval(driftRef.current);
    };
  }, [videoId]);

  // Progress tracker
  useEffect(() => {
    const iv = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
        setYtProgress(playerRef.current.getCurrentTime());
        const d = playerRef.current.getDuration();
        if (d) setYtDuration(d);
      }
    }, 500);
    return () => clearInterval(iv);
  }, []);

  // Handle VIDEO_SYNC events from server
  useEffect(() => {
    const handler = (e) => {
      const data = e.detail;
      const player = playerRef.current;
      if (!player || !ytReady) return;

      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
      if (driftRef.current) {
        clearInterval(driftRef.current);
        driftRef.current = null;
      }

      if (data.action === 'PLAY') {
        syncStateRef.current = { startAt: data.startAt, playFrom: data.time };
        const localStart = data.startAt - clockOffsetRef.current;
        const delay = localStart - Date.now();

        player.seekTo(data.time, true);

        if (delay > 0) {
          player.pauseVideo();
          playTimeoutRef.current = setTimeout(() => {
            player.playVideo();
            setYtPlaying(true);
            startYtDrift(player);
          }, delay);
        } else {
          player.seekTo(data.time + Math.abs(delay) / 1000, true);
          player.playVideo();
          setYtPlaying(true);
          startYtDrift(player);
        }
      } else {
        player.pauseVideo();
        player.seekTo(data.time, true);
        setYtPlaying(false);
      }
    };

    const startYtDrift = (player) => {
      driftRef.current = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function') return;
        const state = player.getPlayerState();
        if (state !== window.YT.PlayerState.PLAYING) return;
        const { startAt, playFrom } = syncStateRef.current;
        if (!startAt) return;
        const serverNow = Date.now() + clockOffsetRef.current;
        const expected = playFrom + (serverNow - startAt) / 1000;
        const drift = player.getCurrentTime() - expected;
        if (Math.abs(drift) > 0.3) {
          player.seekTo(expected, true);
        }
      }, 3000);
    };

    window.addEventListener('yt-sync', handler);
    return () => window.removeEventListener('yt-sync', handler);
  }, [ytReady, clockOffsetRef, playTimeoutRef, syncStateRef]);

  const handleYtPlay = () => send({ type: 'VIDEO_CONTROL', action: 'PLAY' });
  const handleYtPause = () => {
    const t = playerRef.current?.getCurrentTime() || 0;
    send({ type: 'VIDEO_CONTROL', action: 'PAUSE', time: t });
  };
  const handleYtSeek = (time) => send({ type: 'VIDEO_CONTROL', action: 'SEEK', time });

  return (
    <Shell connected={connected}>
      <div className="flex w-full max-w-3xl gap-4 flex-col lg:flex-row">
        <Card className="w-full flex-1">
          <CardContent className="flex flex-col items-center gap-4 p-6">
            {/* Room info */}
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1">
                  <Youtube className="h-3 w-3 text-red-500" />
                  <span className="text-xs font-medium text-red-400">LIVE VIDEO</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <Users className="h-3 w-3" />
                  <span>{listenerCount} watching</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="font-mono text-xs text-zinc-500">{roomKey}</code>
                <button onClick={copyKey} className="text-zinc-500 hover:text-white transition-colors cursor-pointer">
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>

            {/* YouTube embed */}
            <div className="w-full aspect-video rounded-xl overflow-hidden bg-black">
              <div ref={containerRef} className="w-full h-full" />
            </div>

            {/* Progress bar */}
            <div className="w-full flex flex-col gap-1">
              <div
                className="relative w-full h-1.5 bg-zinc-800 rounded-full cursor-pointer group"
                onClick={(e) => {
                  if (!ytDuration) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  handleYtSeek(pct * ytDuration);
                }}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-red-500 rounded-full transition-all"
                  style={{ width: `${ytDuration ? (ytProgress / ytDuration) * 100 : 0}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `${ytDuration ? (ytProgress / ytDuration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600">
                <span>{formatTime(ytProgress)}</span>
                <span>{formatTime(ytDuration)}</span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-3 w-full justify-center">
              <button
                onClick={() => handleYtSeek(Math.max(0, ytProgress - 10))}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <SkipBack className="h-5 w-5" />
              </button>

              <Button
                variant="primary"
                size="lg"
                className="w-14 h-14 rounded-full p-0 flex items-center justify-center"
                onClick={ytPlaying ? handleYtPause : handleYtPlay}
                disabled={!ytReady}
              >
                {ytPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
              </Button>

              <button
                onClick={() => handleYtSeek(Math.min(ytDuration || 0, ytProgress + 10))}
                className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
              >
                <SkipForward className="h-5 w-5" />
              </button>
            </div>

            <p className="text-[10px] text-zinc-700 text-center">Video loads from YouTube on each device — only controls are synced</p>
          </CardContent>
        </Card>

        {/* Chat panel (reused) */}
        <Card className={`w-full lg:w-72 flex flex-col transition-all ${chatOpen ? 'max-h-[500px]' : 'max-h-12 overflow-hidden'}`}>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="flex items-center gap-2 p-3 text-sm font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <MessageCircle className="h-4 w-4 text-violet-400" />
            Live Chat
            {chatMessages.length > 0 && (
              <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 rounded-full px-2 py-0.5">
                {chatMessages.length}
              </span>
            )}
          </button>
          {chatOpen && (
            <>
              <div className="flex-1 overflow-y-auto px-3 space-y-2 min-h-[200px] max-h-[350px]">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-zinc-700 text-center py-8">No messages yet</p>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium text-violet-400">{msg.sender}: </span>
                    <span className="text-zinc-400">{msg.text}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex gap-2 p-3 border-t border-zinc-800">
                <Input
                  placeholder={nickname ? 'Message...' : 'Set nickname first'}
                  value={nickname ? chatInput : nickname}
                  onChange={(e) => nickname ? setChatInput(e.target.value) : null}
                  onKeyDown={(e) => e.key === 'Enter' && nickname && sendChat()}
                  className="text-xs h-8"
                />
                {!nickname ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 shrink-0"
                    onClick={() => {
                      const name = prompt('Enter your nickname (max 20 chars):');
                      if (name) setNickname(name.slice(0, 20));
                    }}
                  >
                    <Users className="h-3 w-3" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 shrink-0"
                    onClick={sendChat}
                    disabled={!chatInput.trim()}
                  >
                    <Send className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </Shell>
  );
}

// ─── Layout shell ───
function Shell({ connected, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      {/* Connection badge */}
      <div className="fixed top-4 right-4">
        <Badge variant={connected ? 'success' : 'destructive'}>
          {connected
            ? <><Wifi className="mr-1 h-3 w-3" /> Connected</>
            : <><WifiOff className="mr-1 h-3 w-3" /> Disconnected</>
          }
        </Badge>
      </div>
      {children}
    </div>
  );
}