import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc,
  getDoc 
} from 'firebase/firestore';

// --- SENİN KENDİ FIREBASE BAĞLANTIN ---
const firebaseConfig = {
  apiKey: "AIzaSyCjOh8TB9zK-tDtoBlbyNx60z2OClRJaJQ",
  authDomain: "pis7li-c6803.firebaseapp.com",
  projectId: "pis7li-c6803",
  storageBucket: "pis7li-c6803.firebasestorage.app",
  messagingSenderId: "658851824296",
  appId: "1:658851824296:web:4847c1f011a093643a389d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "pis7li-c6803";

// --- Oyun Sabitleri ---
const SUITS = ['sinek', 'karo', 'kupa', 'maca'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const ROUND_OPTIONS = [7, 11, 15, 21];
const BET_OPTIONS = [5, 10, 20, 50, 100];
const CARD_BACK_IMAGE = 'https://i.ibb.co/HppdF5nY/freepik-minimal-futuristic-gaming-logo-forge-hammer-combin-64278.png';

const EMOJIS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🐧', '🦉', '🦄', '🐺', '🦖', '🐙', '👾', '🤖', '👽', '👻', '🐊', '🦈', '🐲', '🦅'];

// --- SES MOTORU (Web Audio API) ---
let audioCtx = null;
const unlockAudio = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
};

const playSound = (type, isMuted) => {
  if (isMuted) return;
  try {
    unlockAudio();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'play') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'draw') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'win') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
      osc.frequency.setValueAtTime(800, audioCtx.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.5);
    }
  } catch(e) {}
};

// --- Yardımcı Fonksiyonlar ---
const getUniqueAvatar = (existingPlayers) => {
  const used = existingPlayers.map(p => p.avatar);
  const available = EMOJIS.filter(e => !used.includes(e));
  return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : '👤';
};

const getSuitSymbol = (suit) => {
  switch (suit) {
    case 'kupa': return '♥';
    case 'karo': return '♦';
    case 'sinek': return '♣';
    case 'maca': return '♠';
    case 'joker': return '🃏';
    default: return '';
  }
};

const getSuitColor = (suit) => {
  if (suit === 'kupa' || suit === 'karo') return 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]';
  if (suit === 'joker') return 'text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]';
  return 'text-slate-800';
};

const isSpecialCard = (card) => {
  return ['A', '7', '10', 'J', 'Joker'].includes(card.rank); 
};

// --- MERKEZİ GEÇERLİLİK KONTROLÜ ---
const checkValidPlay = (card, room) => {
  if (!room) return false;
  
  const isFirstRound = room.cardsPlayedThisRound < room.players.length;
  
  // 1. İlk Tur Kuralı: Özel kart yasak ve SADECE SİNEK atılabilir
  if (isFirstRound || room.discard.length === 0) {
    return card.suit === 'sinek' && !isSpecialCard(card);
  }
  
  // 2. İçeride ceza varsa SADECE aynı ceza kartıyla savuşturulabilir
  if (room.pendingDraw > 0) {
    const topCard = room.discard[room.discard.length - 1];
    if (topCard.rank === '7') return card.rank === '7';
    if (topCard.rank === 'Joker') return card.rank === 'Joker';
    return false;
  }
  
  const topCard = room.discard[room.discard.length - 1];
  if (!topCard) return true;
  
  // 3. Standart Eşleşmeler
  return card.rank === 'Joker' || 
         card.rank === 'J' || 
         card.suit === room.currentSuit || 
         card.rank === topCard.rank;
};

const generateDeck = () => {
  let newDeck = [];
  let id = 0;
  for (let d = 0; d < 2; d++) {
    SUITS.forEach(suit => {
      RANKS.forEach(rank => {
        newDeck.push({ id: `c_${id++}`, suit, rank });
      });
    });
  }
  newDeck.push({ id: `c_${id++}`, suit: 'joker', rank: 'Joker' });
  newDeck.push({ id: `c_${id++}`, suit: 'joker', rank: 'Joker' });

  for (let i = newDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
  }
  return newDeck;
};

const calculateScore = (hand) => {
  return hand.reduce((total, card) => {
    if (card.rank === 'Joker') return total + 50;
    if (card.rank === 'J') return total + 20;
    if (['A', 'K', 'Q', '10'].includes(card.rank)) return total + 10;
    return total + parseInt(card.rank) || 0; 
  }, 0);
};

// --- Ortak Arka Plan ve Navbar ---
const BaseWrapper = ({ children, roomCode, room, playerName, toast, isMuted, setIsMuted }) => (
  <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 font-sans text-white overflow-hidden flex flex-col selection:bg-emerald-500/30">
    <style>{`
      .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
      .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(16, 185, 129, 0.4); border-radius: 10px; }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16, 185, 129, 0.8); }
    `}</style>
    
    <header className="bg-black/30 backdrop-blur-md p-3 sm:p-4 flex justify-between items-center z-50 border-b border-white/5 shadow-md sticky top-0">
      <div className="font-black text-lg sm:text-xl md:text-2xl tracking-tighter bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent flex items-center gap-1 sm:gap-2">
        <span>PİS 7'Lİ</span> <span className="text-[8px] sm:text-[10px] bg-white/10 text-white px-1.5 sm:px-2 py-0.5 rounded-full border border-white/20 uppercase tracking-widest mt-1 hidden xs:inline-block">Forge&Play</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium">
        {room && (
          <div className="bg-amber-500/20 text-amber-300 px-2 sm:px-3 py-1 rounded-full border border-amber-500/30 font-bold hidden md:flex items-center gap-1">
            💰 Havuz: {room.betAmount * room.players.length} TL
          </div>
        )}
        <button onClick={() => setIsMuted(!isMuted)} className="text-xl sm:text-2xl hover:scale-110 transition-transform bg-white/5 px-2 py-1 rounded-lg" title="Sesi Aç/Kapat">
          {isMuted ? '🔇' : '🔊'}
        </button>
        {roomCode && <span className="bg-emerald-500/20 text-emerald-300 px-2 sm:px-3 py-1 rounded-full border border-emerald-500/30 hidden sm:inline-block">Oda: {roomCode}</span>}
        <span className="opacity-80 flex items-center gap-1 sm:gap-2">
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500 animate-pulse"></div> 
          <span className="max-w-[60px] sm:max-w-none truncate">{playerName || 'Misafir'}</span>
        </span>
      </div>
    </header>
    
    {toast && (
      <div className="fixed top-16 sm:top-20 left-1/2 transform -translate-x-1/2 bg-rose-600/95 backdrop-blur-md text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl font-bold shadow-[0_10px_40px_rgba(225,29,72,0.6)] z-[100] animate-in fade-in slide-in-from-top-4 border border-rose-400/50 whitespace-nowrap text-xs sm:text-base max-w-[90vw] overflow-hidden text-ellipsis text-center">
        {toast}
      </div>
    )}
    
    <main className="flex-1 relative flex flex-col w-full h-full">
      {children}
    </main>
  </div>
);

// --- Ana Uygulama ---
export default function App() {
  const [user, setUser] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [selectedRounds, setSelectedRounds] = useState(7);
  const [selectedBet, setSelectedBet] = useState(10);
  const [route, setRoute] = useState('landing'); 
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  
  const [pendingJackIndex, setPendingJackIndex] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [viewedPlayer, setViewedPlayer] = useState(null); 
  
  const isProcessing = useRef(false);
  const prevDiscardLen = useRef(0);
  const prevDeckLen = useRef(0);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Just use anonymous auth since custom token might mismatch when moving between environments
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !roomCode) return;

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRoom(data);
        
        if (data.status === 'playing') setRoute('table');
        else if (data.status === 'round_end') setRoute('round_end');
        else if (data.status === 'game_over') setRoute('game_over');
        else if (data.status === 'waiting') setRoute('lobby');
        
        const me = data.players.find(p => p.uid === user.uid);
        if (me) setMyHand(me.hand || []);
        
        isProcessing.current = false; 
      } else {
        setError('Oda bulunamadı veya kapandı.');
        setRoute('landing');
      }
    }, (err) => {
      console.error("Snapshot error:", err);
      setError("Bağlantı koptu.");
    });

    return () => unsubscribe();
  }, [user, roomCode]);

  useEffect(() => {
    if (!room || isMuted) return;
    
    if (room.discard && room.discard.length > prevDiscardLen.current) playSound('play', false);
    else if (room.deck && room.deck.length < prevDeckLen.current) playSound('draw', false);
    
    if (room.status === 'round_end' || room.status === 'game_over') {
      if (prevDiscardLen.current > 0) playSound('win', false);
    }

    if (room.discard) prevDiscardLen.current = room.discard.length;
    if (room.deck) prevDeckLen.current = room.deck.length;
  }, [room, isMuted]);

  const showToast = (msg) => {
    setToast(msg);
    playSound('error', isMuted);
    setTimeout(() => setToast(''), 3500);
  };

  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    if (room.hostId !== user.uid) return; 

    const activePlayer = room.players[room.turn];
    if (!activePlayer.isBot) return;

    const botTimer = setTimeout(() => {
       executeBotTurn(activePlayer);
    }, 1800);

    return () => clearTimeout(botTimer);
  }, [room?.turn, room?.status, room?.players[room?.turn]?.cardCount, room?.pendingDraw, room?.hasDrawn]);

  const executeBotTurn = async (bot) => {
    if (isProcessing.current) return;
    let validCardIndex = -1;
    let selectedSuitForJack = null;

    const validIndices = bot.hand.map((c, i) => checkValidPlay(c, room) ? i : -1).filter(i => i !== -1);

    if (validIndices.length > 0) {
      validCardIndex = validIndices[0]; 
      if (bot.hand[validCardIndex].rank === 'J') {
         const suits = { sinek:0, karo:0, kupa:0, maca:0 };
         bot.hand.forEach(c => { if(c.suit !== 'joker') suits[c.suit]++; });
         selectedSuitForJack = Object.keys(suits).reduce((a, b) => suits[a] > suits[b] ? a : b);
      }
    }

    if (validCardIndex !== -1) {
      if (bot.hand.length === 2 && !bot.saidTek) {
        await handleAction('SAY_TEK', null, bot.uid); 
        setTimeout(() => {
          handleAction('PLAY', { cardIndex: validCardIndex, selectedSuit: selectedSuitForJack }, bot.uid);
        }, 300);
      } else {
        await handleAction('PLAY', { cardIndex: validCardIndex, selectedSuit: selectedSuitForJack }, bot.uid);
      }
    } else {
      const isFirstRound = room.cardsPlayedThisRound < room.players.length;
      if (room.hasDrawn && !isFirstRound && room.pendingDraw === 0) {
        await handleAction('PASS', null, bot.uid);
      } else {
        await handleAction('DRAW', null, bot.uid);
      }
    }
  };

  const handleAction = async (type, payload, actorUid) => {
    if (isProcessing.current && actorUid === user.uid) return;
    isProcessing.current = true;

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode);
    const snap = await getDoc(roomRef);
    if (!snap.exists()) { isProcessing.current = false; return; }
    let r = snap.data();

    if (type !== 'SAY_TEK' && r.players[r.turn].uid !== actorUid) {
      isProcessing.current = false;
      return;
    }

    const actorIndex = r.players.findIndex(p => p.uid === actorUid);
    if (actorIndex === -1) { isProcessing.current = false; return; }
    const actor = r.players[actorIndex];

    const applyEndGamePenaltiesAndScore = (roomData, winnerUid, multiplier = 1) => {
      roomData.players.forEach(p => {
        if (p.uid !== winnerUid) {
          let extraPenalty = 0;
          p.hand.forEach(c => {
            if (c.rank === '7') extraPenalty += 3;
            if (c.rank === 'Joker') extraPenalty += 10;
          });

          for (let i = 0; i < extraPenalty; i++) {
            if (roomData.deck.length === 0 && roomData.discard.length > 1) {
              const topCard = roomData.discard.pop();
              roomData.deck = [...roomData.discard].sort(() => Math.random() - 0.5);
              roomData.discard = [topCard];
            }
            if (roomData.deck.length > 0) {
              p.hand.push(roomData.deck.pop());
              p.cardCount++;
            }
          }

          p.roundScore = calculateScore(p.hand) * multiplier;
          p.totalScore += p.roundScore;
        } else {
          p.roundScore = 0; // Kazanan kesinlikle 0
        }
      });
    };

    try {
      if (type === 'SAY_TEK') {
        if (actor.hand.length !== 2) {
           if(actorUid === user.uid) showToast("Sadece 2 kartınız kaldığında (atmadan hemen önce) TEK diyebilirsiniz!");
           isProcessing.current = false; return;
        }
        r.players[actorIndex].saidTek = true;
      }
      
      else if (type === 'PASS') {
        const isFirstRound = r.cardsPlayedThisRound < r.players.length;
        if (isFirstRound || !r.hasDrawn || r.pendingDraw > 0) {
            isProcessing.current = false; return; 
        }
        r.turn = getNextTurn(r.turn, r.direction, r.players.length, 1);
        r.hasDrawn = false;
      }

      else if (type === 'DRAW') {
        const isFirstRound = r.cardsPlayedThisRound < r.players.length;

        if (isFirstRound || r.discard.length === 0) {
           const hasValidSinek = actor.hand.some(c => c.suit === 'sinek' && !isSpecialCard(c));
           if (hasValidSinek) {
              if (actorUid === user.uid) showToast("Elinizde normal bir Sinek (♣) var! Çekmek yerine onu atmalısınız.");
              isProcessing.current = false; return;
           }
        }

        if (r.deck.length === 0) {
           applyEndGamePenaltiesAndScore(r, null, 1);
           r.winner = "Deste Bitti";
           r.status = r.currentRound >= r.totalRounds ? 'game_over' : 'round_end';
        } else {
           if (r.pendingDraw > 0) {
              let drawCount = Math.min(r.pendingDraw, r.deck.length);
              for(let i = 0; i < drawCount; i++) r.players[actorIndex].hand.push(r.deck.pop());
              r.players[actorIndex].cardCount += drawCount;
              r.pendingDraw = 0;
           } else {
              r.players[actorIndex].hand.push(r.deck.pop());
              r.players[actorIndex].cardCount++;
           }
           
           r.players[actorIndex].saidTek = false;
           r.hasDrawn = true; 

           if (r.deck.length === 0) {
              applyEndGamePenaltiesAndScore(r, null, 1);
              r.winner = "Deste Bitti";
              r.status = r.currentRound >= r.totalRounds ? 'game_over' : 'round_end';
           } 
        }
      }

      else if (type === 'PLAY') {
        const { cardIndex, selectedSuit } = payload;
        const card = actor.hand[cardIndex];

        if (!checkValidPlay(card, r)) {
           if(actorUid === user.uid) {
              const isFirstRound = r.cardsPlayedThisRound < r.players.length;
              if (isFirstRound || r.discard.length === 0) {
                 showToast("İLK TUR KURALI: Sadece ÖZEL OLMAYAN Sinek (♣) atabilirsiniz!");
              } else if (r.pendingDraw > 0) {
                 showToast("Sana ceza geldi! Ya aynı cezayı atarak katla, ya da CEZA ÇEK!");
              } else {
                 showToast("Geçersiz hamle! Renk veya sayı uymuyor.");
              }
           }
           isProcessing.current = false; return;
        }

        if (actor.hand.length === 2 && !actor.saidTek) {
          if(actorUid === user.uid) showToast("Kart atmadan ÖNCE 'TEK DE' demelisiniz! Hamleniz iptal edildi, 2 Kart Ceza Yediniz!");
          
          for (let i = 0; i < 2; i++) {
            if (r.deck.length > 0) {
              r.players[actorIndex].hand.push(r.deck.pop());
              r.players[actorIndex].cardCount++;
            }
          }
          r.players[actorIndex].saidTek = false;
          
          if (r.deck.length === 0) {
             applyEndGamePenaltiesAndScore(r, null, 1);
             r.winner = "Deste Bitti";
             r.status = r.currentRound >= r.totalRounds ? 'game_over' : 'round_end';
          }
          
          await updateDoc(roomRef, r);
          isProcessing.current = false; return;
        }

        r.players[actorIndex].hand.splice(cardIndex, 1);
        r.players[actorIndex].cardCount--;
        r.discard.push(card);
        r.cardsPlayedThisRound += 1;
        r.hasDrawn = false; 

        let nextSuit = card.rank === 'J' ? selectedSuit : card.suit;
        if (card.rank === 'Joker') nextSuit = r.currentSuit;
        
        let newDir = r.direction;
        let skipCount = 1;

        if (card.rank === '10') newDir *= -1;
        if (card.rank === 'A') skipCount = 2;

        r.currentSuit = nextSuit;
        r.direction = newDir;

        if (card.rank === '7') r.pendingDraw += 3;
        if (card.rank === 'Joker') r.pendingDraw += 10;

        let nextTurn = getNextTurn(r.turn, newDir, r.players.length, skipCount);

        if (r.players[actorIndex].cardCount === 0) {
          let multiplier = card.rank === 'J' ? 2 : 1;
          applyEndGamePenaltiesAndScore(r, actorUid, multiplier);
          r.winner = actor.name;
          r.status = r.currentRound >= r.totalRounds ? 'game_over' : 'round_end';
        } else if (r.deck.length === 0) {
          applyEndGamePenaltiesAndScore(r, null, 1);
          r.winner = "Deste Bitti";
          r.status = r.currentRound >= r.totalRounds ? 'game_over' : 'round_end';
        } else {
          r.turn = nextTurn;
        }
      }

      await updateDoc(roomRef, r);
    } catch (e) {
      console.error(e);
    } finally {
      isProcessing.current = false;
    }
  };

  const getNextTurn = (currentTurn, dir, totalPlayers, skipCount = 1) => {
    let next = (currentTurn + (dir * skipCount)) % totalPlayers;
    if (next < 0) next += totalPlayers;
    return next;
  };

  const handleCreateRoom = async () => {
    if (!user || !playerName.trim()) return setError('Lütfen isminizi girin.');
    unlockAudio();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const newRoom = {
      id: code,
      hostId: user.uid,
      totalRounds: selectedRounds,
      betAmount: selectedBet,
      currentRound: 1,
      status: 'waiting', 
      players: [{ uid: user.uid, name: playerName, avatar: getUniqueAvatar([]), isBot: false, hand: [], cardCount: 0, saidTek: false, roundScore: 0, totalScore: 0 }],
      deck: [],
      discard: [],
      turn: 0,
      direction: 1,
      currentSuit: '',
      pendingDraw: 0,
      cardsPlayedThisRound: 0,
      hasDrawn: false,
      winner: null
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', code), newRoom);
      setRoomCode(code);
    } catch (err) {
      setError('Oda oluşturulamadı.');
    }
  };

  const handleJoinRoom = async () => {
    if (!user || !playerName.trim() || !roomCode.trim()) return setError('İsim ve Oda Kodu zorunludur.');
    unlockAudio();
    const code = roomCode.toUpperCase();
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', code);
    
    try {
      const snap = await getDoc(roomRef);
      if (!snap.exists()) return setError('Oda bulunamadı.');
      const data = snap.data();
      
      if (data.players.find(p => p.uid === user.uid)) {
        setRoomCode(code); return; 
      }

      if (data.status !== 'waiting') return setError('Oyun zaten başlamış.');
      if (data.players.length >= 7) return setError('Oda tam dolu (Max 7).');

      const updatedPlayers = [...data.players, { uid: user.uid, name: playerName, avatar: getUniqueAvatar(data.players), isBot: false, hand: [], cardCount: 0, saidTek: false, roundScore: 0, totalScore: 0 }];
      await updateDoc(roomRef, { players: updatedPlayers });
      setRoomCode(code);
    } catch (err) {
      setError('Odaya katılırken hata oluştu.');
    }
  };

  const handleAddBot = async () => {
    if (!room || room.hostId !== user.uid || room.players.length >= 7) return;
    const botNum = room.players.filter(p => p.isBot).length + 1;
    const updatedPlayers = [...room.players, { 
      uid: `bot_${Date.now()}_${botNum}`, 
      name: `Bot ${botNum}`, 
      avatar: getUniqueAvatar(room.players),
      isBot: true, 
      hand: [], cardCount: 0, saidTek: false, roundScore: 0, totalScore: 0 
    }];
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode), { players: updatedPlayers });
  };

  const startRound = async () => {
    if (room.hostId !== user.uid) return;
    if (room.players.length < 2) return setError('En az 2 oyuncu gerekiyor.'); 

    let deck = generateDeck();
    let players = room.players.map(p => ({
       ...p, hand: [], cardCount: 7, saidTek: false, roundScore: 0
    }));

    for (let i = 0; i < 7; i++) {
      for (let p = 0; p < players.length; p++) {
        players[p].hand.push(deck.pop());
      }
    }

    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode), {
      status: 'playing',
      players,
      deck,
      discard: [],
      turn: Math.floor(Math.random() * players.length),
      direction: 1,
      currentSuit: '',
      pendingDraw: 0,
      cardsPlayedThisRound: 0,
      hasDrawn: false,
      winner: null
    });
  };

  const nextRound = async () => {
     if (room.hostId !== user.uid) return;
     setViewedPlayer(null); 
     await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomCode), {
        currentRound: room.currentRound + 1
     });
     startRound();
  };

  if (!user) {
    return <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center text-white text-xl animate-pulse tracking-widest">AĞA BAĞLANILIYOR...</div>;
  }

  if (route === 'landing') {
    return (
      <BaseWrapper roomCode={roomCode} room={room} playerName={playerName} toast={toast} isMuted={isMuted} setIsMuted={setIsMuted}>
        <div className="flex-1 flex items-center justify-center p-4 sm:p-8 relative">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/20 rounded-full blur-[100px] pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"></div>
          
          <div className="bg-white/5 p-6 md:p-10 rounded-[2rem] shadow-2xl backdrop-blur-xl max-w-md w-full border border-white/10 text-center relative z-10">
            <h1 className="text-3xl md:text-5xl font-black mb-6 md:mb-8 text-white drop-shadow-md">Masaya Katıl</h1>
            {error && <div className="bg-rose-500/20 text-rose-200 border border-rose-500/50 p-3 rounded-xl mb-6 text-sm">{error}</div>}
            
            <input 
              type="text" 
              placeholder="Oyuncu Adınız" 
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-3 md:p-4 mb-4 text-white text-base md:text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-white/30"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
            />
            
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="bg-black/20 p-3 rounded-2xl border border-white/5 flex-1">
                 <div className="text-[10px] text-white/50 mb-1.5 font-bold uppercase tracking-widest">Tur Sayısı (Host)</div>
                 <select value={selectedRounds} onChange={(e) => setSelectedRounds(Number(e.target.value))} className="w-full bg-slate-900 text-emerald-400 font-bold p-2 rounded-lg border border-white/10 outline-none text-sm">
                    {ROUND_OPTIONS.map(r => <option key={r} value={r}>{r} Tur</option>)}
                 </select>
              </div>
              <div className="bg-black/20 p-3 rounded-2xl border border-white/5 flex-1">
                 <div className="text-[10px] text-white/50 mb-1.5 font-bold uppercase tracking-widest">Bahis (Host)</div>
                 <select value={selectedBet} onChange={(e) => setSelectedBet(Number(e.target.value))} className="w-full bg-slate-900 text-amber-400 font-bold p-2 rounded-lg border border-white/10 outline-none text-sm">
                    {BET_OPTIONS.map(b => <option key={b} value={b}>{b} TL</option>)}
                 </select>
              </div>
            </div>
            
            <button 
              onClick={handleCreateRoom}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-900 font-black py-3 md:py-4 rounded-2xl mb-4 shadow-lg transition-transform hover:scale-[1.02] active:scale-95 text-base md:text-lg"
            >
              YENİ ODA KUR
            </button>
            
            <div className="relative flex py-2 items-center mb-4">
              <div className="flex-grow border-t border-white/10"></div>
              <span className="flex-shrink-0 mx-4 text-white/30 text-[10px] sm:text-xs font-bold uppercase tracking-widest">VEYA ODAYA KATIL</span>
              <div className="flex-grow border-t border-white/10"></div>
            </div>

            <div className="flex gap-2 w-full">
               <input 
                 type="text" 
                 placeholder="KOD" 
                 className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-2xl p-3 md:p-4 text-white text-center font-bold text-lg md:text-xl uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-white/20 placeholder:tracking-normal"
                 value={roomCode}
                 onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                 maxLength={6}
               />
               <button 
                 onClick={handleJoinRoom}
                 className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 sm:px-8 rounded-2xl shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
               >
                 GİR
               </button>
            </div>
          </div>
        </div>
      </BaseWrapper>
    );
  }

  if (route === 'lobby') {
    return (
      <BaseWrapper roomCode={roomCode} room={room} playerName={playerName} toast={toast} isMuted={isMuted} setIsMuted={setIsMuted}>
        <div className="flex-1 flex items-center justify-center p-4">
           <div className="bg-white/5 p-6 md:p-10 rounded-[2rem] shadow-2xl backdrop-blur-xl max-w-lg w-full text-center border border-white/10">
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-emerald-400 mb-2">Bekleme Odası Kodu</h2>
            <div className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-widest mb-6 md:mb-8 bg-black/30 py-3 sm:py-4 rounded-2xl border border-white/5 shadow-inner select-all">
              {room.id}
            </div>
            
            <div className="text-left mb-6 md:mb-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-white/10 pb-2 mb-4 gap-2">
                 <h3 className="text-white/60 font-bold uppercase tracking-wider text-xs sm:text-sm">Oyuncular ({room.players.length}/7)</h3>
                 {room.hostId === user.uid && room.players.length < 7 && (
                   <button onClick={handleAddBot} className="text-[10px] sm:text-xs bg-purple-600/80 hover:bg-purple-500 text-white px-2 sm:px-3 py-1.5 rounded-lg font-bold transition-all border border-purple-400/50">+ YAPAY ZEKA EKLE</button>
                 )}
              </div>
              <ul className="space-y-2 sm:space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                {room.players.map((p, i) => (
                  <li key={p.uid} className="flex items-center gap-3 sm:gap-4 bg-black/20 p-2 sm:p-3 rounded-xl border border-white/5">
                    <div className="text-xl sm:text-2xl md:text-3xl bg-white/5 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full border border-white/10 shadow-inner flex-shrink-0">{p.avatar}</div>
                    <span className="font-bold text-base sm:text-lg truncate">{p.name}</span>
                    <div className="ml-auto flex gap-1 sm:gap-2 flex-shrink-0">
                       {p.isBot && <span className="text-[9px] sm:text-xs bg-slate-800 text-slate-300 px-1.5 sm:px-2 py-1 rounded-md border border-slate-600">BOT</span>}
                       {p.uid === room.hostId && <span className="text-[9px] sm:text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 sm:px-2 py-1 rounded-md">KURUCU</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {room.hostId === user.uid ? (
              <button 
                onClick={startRound}
                disabled={room.players.length < 2} 
                className={`w-full font-black text-base sm:text-lg py-4 sm:py-5 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] transition-all ${room.players.length >= 2 ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-900 hover:scale-[1.02] active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                {room.players.length < 2 ? 'EN AZ 2 OYUNCU GEREKİYOR' : 'OYUNU BAŞLAT'}
              </button>
            ) : (
              <div className="bg-black/30 py-3 sm:py-4 rounded-xl text-emerald-400/80 animate-pulse font-bold tracking-widest text-xs sm:text-sm uppercase">Kurucunun başlatması bekleniyor...</div>
            )}
          </div>
        </div>
      </BaseWrapper>
    );
  }

  if (route === 'table') {
    const opponents = room.players.filter(p => p.uid !== user.uid);
    const me = room.players.find(p => p.uid === user.uid);
    const isMyTurn = room.players[room.turn].uid === user.uid;

    const handCount = myHand.length;
    let cardWidthClass = 'w-16 sm:w-24 md:w-32';
    let cardHeightClass = 'h-24 sm:h-36 md:h-48';
    let overlapClass = '-ml-10 sm:-ml-12 md:-ml-16';
    let textSizeClass = 'text-sm sm:text-lg md:text-2xl';
    let iconSizeClass = 'text-3xl sm:text-5xl md:text-6xl';

    if (handCount > 20) { 
       cardWidthClass = 'w-10 sm:w-14 md:w-16';
       cardHeightClass = 'h-16 sm:h-20 md:h-24';
       overlapClass = '-ml-6 sm:-ml-8 md:-ml-10';
       textSizeClass = 'text-[10px] sm:text-xs md:text-sm';
       iconSizeClass = 'text-lg sm:text-2xl md:text-3xl';
    } else if (handCount > 12) { 
       cardWidthClass = 'w-12 sm:w-16 md:w-24';
       cardHeightClass = 'h-18 sm:h-24 md:h-36';
       overlapClass = '-ml-7 sm:-ml-10 md:-ml-12';
       textSizeClass = 'text-xs sm:text-sm md:text-lg';
       iconSizeClass = 'text-xl sm:text-3xl md:text-5xl';
    }

    const isFirstRound = room.cardsPlayedThisRound < room.players.length;
    const canPass = room.hasDrawn && !isFirstRound && room.pendingDraw === 0;
    
    let drawBtnText = "";
    let drawBtnStyle = "bg-black/80 text-white/90";
    let drawAction = 'DRAW';
    
    if (room.pendingDraw > 0) {
        drawBtnText = `CEZA ÇEK (${room.pendingDraw})`;
        drawBtnStyle = "bg-rose-600 text-white shadow-[0_0_20px_rgba(225,29,72,0.8)] animate-pulse";
    } else if (canPass) {
        drawBtnText = "PAS GEÇ";
        drawBtnStyle = "bg-amber-600 text-white";
        drawAction = 'PASS';
    } else {
        drawBtnText = "KART ÇEK";
    }

    return (
      <BaseWrapper roomCode={roomCode} room={room} playerName={playerName} toast={toast} isMuted={isMuted} setIsMuted={setIsMuted}>
         <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M54.627 0l.83.83v58.34h-58.34l-.83-.83L0 54.628l.83-.83h58.34v-58.34l.83.83z' fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")` }}></div>

         {/* Z-50 Üst Katman Uyarıları (Görünürlük Artırıldı) */}
         <div className="absolute top-[22%] sm:top-[18%] left-0 w-full flex flex-col items-center gap-3 z-[60] pointer-events-none px-4">
           {(isFirstRound || room.discard.length === 0) && (
             <div className="bg-blue-600/95 text-white px-6 py-3 rounded-full text-sm sm:text-base font-black border-2 border-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.8)] animate-pulse uppercase tracking-widest text-center">
               İLK TUR: SADECE NORMAL SİNEK (♣) ATILABİLİR (Özel Kart Yasak)
             </div>
           )}
           {room.pendingDraw > 0 && (
             <div className="bg-rose-600/95 text-white px-6 py-3 rounded-full text-sm sm:text-base font-black border-2 border-rose-400 shadow-[0_0_30px_rgba(225,29,72,0.8)] animate-pulse uppercase tracking-widest text-center">
               🚨 CEZA VAR! 7/JOKER AT YADA CEZA ÇEK
             </div>
           )}
         </div>

         {/* Rakipler Alanı (Üst) */}
         <div className="w-full flex justify-center items-start pt-2 sm:pt-4 px-1 sm:px-4 z-10 gap-1 sm:gap-4 flex-wrap max-h-[35vh] overflow-y-auto custom-scrollbar">
            {opponents.map(p => {
               const pIndex = room.players.findIndex(x => x.uid === p.uid);
               const isActive = room.turn === pIndex;
               
               return (
                 <div key={p.uid} className={`flex flex-col items-center bg-black/40 backdrop-blur-md p-1.5 sm:p-3 rounded-xl border transition-all duration-300 ${isActive ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)] -translate-y-1 sm:-translate-y-2' : 'border-white/5'}`}>
                   <div className="relative mb-1 sm:mb-2">
                     <div className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-lg sm:text-xl md:text-3xl ${isActive ? 'bg-emerald-500/20' : 'bg-slate-800/50'}`}>
                       {p.avatar}
                     </div>
                     {p.saidTek && <div className="absolute -bottom-1 -right-1 sm:-bottom-2 sm:-right-2 bg-rose-600 text-white text-[7px] sm:text-[9px] font-black px-1 py-0.5 rounded shadow-lg border border-white/20">TEK</div>}
                   </div>
                   <div className="font-bold text-[9px] sm:text-xs md:text-sm truncate w-12 sm:w-16 md:w-20 text-center mb-0.5 sm:mb-1 text-white/80">{p.name}</div>
                   
                   {/* Kapalı Kartlar */}
                   <div className="flex -space-x-2 sm:-space-x-3 md:-space-x-4 mt-0.5 sm:mt-1">
                     {[...Array(Math.min(p.cardCount, 6))].map((_, idx) => (
                       <div key={idx} className="w-4 h-6 sm:w-6 sm:h-9 md:w-8 md:h-12 bg-slate-900 rounded-sm border border-white/20 shadow-md flex items-center justify-center bg-cover bg-center overflow-hidden" style={{ backgroundImage: `url(${CARD_BACK_IMAGE})` }}>
                         <div className="w-full h-full bg-black/30"></div>
                       </div>
                     ))}
                     {p.cardCount > 6 && <div className="w-4 h-6 sm:w-6 sm:h-9 md:w-8 md:h-12 bg-black/80 rounded-sm flex items-center justify-center text-[7px] sm:text-[9px] font-bold z-10 backdrop-blur-sm text-white/90">+{p.cardCount-6}</div>}
                   </div>
                 </div>
               )
            })}
         </div>

         {/* Masa Orta Alanı */}
         <div className="flex-1 flex flex-col items-center justify-center relative z-10 my-2 sm:my-4">
            {isMyTurn && (
              <div className="absolute top-10 sm:-top-4 bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-900 font-black text-sm sm:text-2xl md:text-3xl px-6 sm:px-10 py-1.5 sm:py-3 rounded-full shadow-[0_10px_40px_rgba(16,185,129,0.5)] animate-bounce border border-emerald-200/50 z-20 uppercase tracking-widest">
                SIRA SENDE!
              </div>
            )}

            <div className="flex gap-4 sm:gap-10 md:gap-16 items-center justify-center bg-black/30 p-4 sm:p-10 md:p-16 rounded-[2rem] sm:rounded-full shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] sm:shadow-[inset_0_0_80px_rgba(0,0,0,0.8)] border border-white/5 backdrop-blur-xl w-[95%] sm:w-auto max-w-4xl mt-12 sm:mt-8">
              
              {/* Deste (Draw Pile) */}
              <div className="flex flex-col items-center relative cursor-pointer group" onClick={() => handleAction(drawAction, null, user.uid)}>
                <div className={`w-16 h-24 sm:w-24 sm:h-36 md:w-32 md:h-48 rounded-xl border-2 border-slate-500 shadow-2xl flex items-center justify-center transition-all duration-300 ${isMyTurn ? 'hover:-translate-y-2 sm:hover:-translate-y-4 ring-2 sm:ring-4 ring-emerald-500 ring-offset-2 sm:ring-offset-4 ring-offset-transparent' : 'opacity-80'} bg-cover bg-center overflow-hidden`} style={{ backgroundImage: `url(${CARD_BACK_IMAGE})` }}>
                   <div className="absolute inset-0 bg-black/50 flex items-center justify-center transition-colors group-hover:bg-black/30">
                     <span className={`px-2 sm:px-4 py-1 sm:py-2 rounded-lg font-black text-[8px] sm:text-xs md:text-sm backdrop-blur-md border border-white/20 transition-all text-center ${drawBtnStyle}`}>
                       {drawBtnText}
                     </span>
                   </div>
                </div>
                <div className="absolute top-1 left-1 w-full h-full bg-slate-700 rounded-xl -z-10 border border-slate-600"></div>
                <div className="absolute top-2 left-2 w-full h-full bg-slate-800 rounded-xl -z-20 border border-slate-700"></div>
                <span className="absolute -bottom-5 sm:-bottom-8 font-bold text-white/70 text-[9px] sm:text-xs bg-black/60 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full backdrop-blur-sm">Deste: {room.deck.length}</span>
              </div>

              {/* Atılan Kart */}
              <div className="flex flex-col items-center relative">
                {room.discard.length > 0 ? (
                  <div className={`w-16 h-24 sm:w-24 sm:h-36 md:w-32 md:h-48 bg-white rounded-xl border-2 border-slate-200 flex flex-col justify-between p-1.5 sm:p-2 md:p-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${getSuitColor(room.discard[room.discard.length - 1].suit)}`}>
                     <div className="text-sm sm:text-xl md:text-3xl font-black leading-none">{room.discard[room.discard.length - 1].rank}</div>
                     <div className="text-3xl sm:text-5xl md:text-7xl self-center transform transition-transform duration-500 hover:scale-110">{getSuitSymbol(room.discard[room.discard.length - 1].suit)}</div>
                     <div className="text-sm sm:text-xl md:text-3xl font-black leading-none rotate-180">{room.discard[room.discard.length - 1].rank}</div>
                  </div>
                ) : (
                  <div className="w-16 h-24 sm:w-24 sm:h-36 md:w-32 md:h-48 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center text-white/30 text-[9px] sm:text-xs text-center p-2 backdrop-blur-sm">
                    Masa Boş
                  </div>
                )}
                
                {room.currentSuit && (
                  <div className="absolute -bottom-8 sm:-bottom-10 bg-black/60 px-2 sm:px-4 py-1 sm:py-1.5 rounded-full flex items-center gap-1 sm:gap-2 border border-white/10 backdrop-blur-md">
                    <span className="text-[8px] sm:text-xs text-white/60 font-bold uppercase">Aktif Renk</span>
                    <span className={`text-sm sm:text-xl bg-white w-4 h-4 sm:w-6 sm:h-6 flex items-center justify-center rounded-full shadow-inner ${getSuitColor(room.currentSuit)}`}>{getSuitSymbol(room.currentSuit)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="hidden lg:flex absolute bottom-2 left-4 flex-col gap-2">
               <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-bold text-white/70 border border-white/5 shadow-lg">
                 YÖN: {room.direction === 1 ? '↻ SAAT YÖNÜ' : '↺ TERS YÖN'}
               </div>
            </div>
         </div>

         {/* Alt Alan - Oyuncu Eli */}
         <div className={`mt-auto w-full z-20 transition-colors duration-700 rounded-t-3xl sm:rounded-t-[2.5rem] border-t border-white/5 ${isMyTurn ? 'bg-emerald-950/60 backdrop-blur-xl shadow-[0_-20px_50px_rgba(16,185,129,0.15)]' : 'bg-black/50 backdrop-blur-md'}`}>
            
            <div className="flex justify-between items-center pt-3 sm:pt-6 px-2 sm:px-8">
               <div className="flex items-center gap-2 sm:gap-4">
                 <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-lg sm:text-3xl shadow-inner ${isMyTurn ? 'bg-emerald-500/20' : 'bg-slate-800/50'}`}>
                   {me?.avatar}
                 </div>
                 <div className="flex flex-col">
                   <span className="font-bold text-xs sm:text-lg md:text-xl text-white">{me?.name}</span>
                   <span className="text-[9px] sm:text-xs text-white/50 font-medium">Genel: {me?.totalScore} | {me?.cardCount} Kart</span>
                 </div>
               </div>
               
               {/* TEK Butonu */}
               {me?.hand.length === 2 && !me.saidTek && (
                 <button 
                   onClick={() => handleAction('SAY_TEK', null, user.uid)}
                   className="bg-rose-600 hover:bg-rose-500 text-white font-black px-4 sm:px-10 py-1.5 sm:py-3 md:py-4 rounded-full shadow-[0_0_20px_rgba(225,29,72,0.8)] animate-pulse border sm:border-2 border-rose-300 text-xs sm:text-lg md:text-xl transform hover:scale-105 transition-all"
                 >
                   🔥 TEK DE!
                 </button>
               )}
               {me?.saidTek && me?.hand.length === 2 && (
                 <span className="bg-emerald-600 text-white font-black px-3 sm:px-6 py-1 sm:py-2 rounded-full shadow-lg border border-emerald-400 text-[9px] sm:text-sm tracking-widest uppercase">TEK ✓</span>
               )}
            </div>

            {/* Dinamik ve Kaydırılabilir Kart Yerleşimi */}
            <div className="w-full pt-6 sm:pt-10 pb-4 sm:pb-6 overflow-x-auto overflow-y-visible custom-scrollbar">
              <div className="flex flex-nowrap items-end min-w-max px-4 sm:px-10 h-24 sm:h-36 md:h-48 justify-start sm:justify-center w-full">
                {myHand.map((card, idx) => {
                  const isPlayable = isMyTurn && checkValidPlay(card, room);

                  return (
                    <div 
                      key={card.id}
                      onClick={() => {
                         if (card.rank === 'J' && isPlayable) setPendingJackIndex(idx);
                         else handleAction('PLAY', { cardIndex: idx }, user.uid);
                      }}
                      className={`relative bg-white rounded-lg sm:rounded-xl border border-slate-200 flex flex-col justify-between p-1 sm:p-2 shadow-[0_5px_15px_rgba(0,0,0,0.3)] transition-all duration-300 group flex-shrink-0 cursor-pointer
                        ${cardWidthClass} ${cardHeightClass} ${idx === 0 ? 'ml-0' : overlapClass}
                        ${isMyTurn ? 'hover:-translate-y-4 sm:hover:-translate-y-8 hover:shadow-[0_20px_40px_rgba(0,0,0,0.5)] hover:z-50' : 'opacity-90'}
                        ${isPlayable ? 'ring-2 sm:ring-4 ring-emerald-500 ring-offset-1 sm:ring-offset-2 ring-offset-transparent z-30 transform -translate-y-2 sm:-translate-y-4' : 'z-10'}`}
                    >
                      <div className={`${textSizeClass} font-black leading-none ${getSuitColor(card.suit)}`}>{card.rank}</div>
                      <div className={`${iconSizeClass} self-center transition-transform duration-300 group-hover:scale-110 sm:group-hover:scale-125 ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</div>
                      <div className={`${textSizeClass} font-black leading-none rotate-180 ${getSuitColor(card.suit)}`}>{card.rank}</div>
                      
                      {!isPlayable && isMyTurn && <div className="absolute inset-0 bg-black/40 rounded-lg sm:rounded-xl pointer-events-none backdrop-blur-[1px]"></div>}
                    </div>
                  );
                })}
              </div>
            </div>
         </div>

         {/* Vale Renk Seçici Modal */}
         {pendingJackIndex !== null && (
            <div className="absolute inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-lg">
              <div className="bg-slate-900 border border-white/10 p-6 sm:p-12 rounded-[2rem] sm:rounded-[2.5rem] text-center max-w-sm sm:max-w-md w-full shadow-[0_0_100px_rgba(0,0,0,0.8)] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
                <h3 className="text-xl sm:text-3xl font-black mb-6 sm:mb-8 text-white">Bacak Attın!<br/><span className="text-emerald-400 text-sm sm:text-lg font-medium tracking-widest uppercase">Aktif Rengi Seç</span></h3>
                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                  {SUITS.map(s => (
                    <button key={s} onClick={() => {
                        handleAction('PLAY', { cardIndex: pendingJackIndex, selectedSuit: s }, user.uid);
                        setPendingJackIndex(null);
                    }} className="bg-white/5 hover:bg-white/10 p-4 sm:p-8 rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center transform hover:scale-105 transition-all border border-white/5 hover:border-white/20 shadow-lg">
                      <span className={`text-4xl sm:text-6xl ${getSuitColor(s)}`}>{getSuitSymbol(s)}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setPendingJackIndex(null)} className="mt-6 sm:mt-8 text-white/40 hover:text-white font-bold text-xs sm:text-sm uppercase tracking-widest transition-colors">İptal Et</button>
              </div>
            </div>
          )}
      </BaseWrapper>
    );
  }

  if (route === 'round_end' || route === 'game_over') {
    const isGameOver = route === 'game_over';
    const totalPool = room.betAmount * room.players.length;

    return (
      <BaseWrapper roomCode={roomCode} room={room} playerName={playerName} toast={toast} isMuted={isMuted} setIsMuted={setIsMuted}>
        <div className="flex-1 flex flex-col items-center justify-center p-2 sm:p-4 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-emerald-500/10 rounded-full blur-[80px] sm:blur-[120px] pointer-events-none"></div>
          
          <div className="bg-black/50 p-4 sm:p-6 md:p-12 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl backdrop-blur-2xl max-w-2xl w-full text-center border border-white/10 relative z-10 overflow-hidden">
            {isGameOver && (
              <div className="absolute -top-4 sm:-top-6 left-1/2 transform -translate-x-1/2 bg-amber-500 text-slate-900 font-black px-4 sm:px-6 py-1.5 sm:py-2 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-bounce border-2 border-white flex items-center gap-1 sm:gap-2 text-sm sm:text-xl whitespace-nowrap">
                💰 ÖDÜL: {totalPool} TL
              </div>
            )}
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white mt-4 sm:mt-6 mb-1 sm:mb-2 drop-shadow-lg">
               {isGameOver ? 'OYUN BİTTİ!' : `${room.currentRound}. TUR BİTTİ`}
            </h1>
            <h2 className="text-sm sm:text-xl md:text-2xl text-emerald-400 font-bold mb-4 sm:mb-8 uppercase tracking-widest flex items-center justify-center gap-2 sm:gap-3">
               {isGameOver ? 'ŞAMPİYON:' : 'Kazanan:'} {room.players.find(p => p.name === room.winner)?.avatar} {room.winner}
            </h2>
            
            <div className="bg-white/5 rounded-2xl sm:rounded-3xl overflow-hidden mb-6 sm:mb-8 border border-white/5 max-h-[40vh] sm:max-h-none overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-xs sm:text-sm md:text-base">
                <thead className="bg-black/40 text-white/50 uppercase tracking-widest text-[9px] sm:text-xs sticky top-0">
                  <tr>
                    <th className="p-2 sm:p-4">Oyuncu</th>
                    <th className="p-2 sm:p-4 text-center">Tur</th>
                    <th className="p-2 sm:p-4 text-right">Skor</th>
                  </tr>
                </thead>
                <tbody>
                  {room.players.sort((a,b) => a.totalScore - b.totalScore).map((p, i) => (
                    <tr key={p.uid} onClick={() => setViewedPlayer(p)} className={`cursor-pointer border-t border-white/5 transition-colors hover:bg-white/10 ${p.name === room.winner ? 'bg-emerald-900/20' : ''}`} title="Kartlarını Görmek İçin Tıkla">
                      <td className="p-2 sm:p-4 font-bold flex items-center gap-1 sm:gap-3">
                        <span className="text-white/30 text-[9px] sm:text-xs w-3 sm:w-4">{i+1}.</span> 
                        <span className="text-lg sm:text-xl">{p.avatar}</span> 
                        <span className="truncate max-w-[60px] sm:max-w-[120px]">{p.name}</span> {(isGameOver && i === 0) ? '👑' : (p.name === room.winner && '🏆')}
                      </td>
                      <td className={`p-2 sm:p-4 text-center font-black ${p.roundScore <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p.roundScore > 0 ? '+' : ''}{p.roundScore}
                      </td>
                      <td className={`p-2 sm:p-4 text-right font-black text-sm sm:text-lg ${p.totalScore <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {p.totalScore}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[9px] sm:text-xs text-white/40 mb-4 text-center -mt-4 sm:-mt-6">Oyuncuların kalan kartlarını görmek için satırlara tıklayın.</div>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
               {!isGameOver && room.hostId === user.uid && (
                 <button 
                   onClick={nextRound}
                   className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black py-3 sm:py-4 px-6 sm:px-8 rounded-xl sm:rounded-2xl shadow-lg transition-transform hover:scale-105 uppercase tracking-widest text-sm sm:text-base w-full sm:w-auto"
                 >
                   Sonraki Tura Geç ({room.currentRound + 1}/{room.totalRounds})
                 </button>
               )}
               {!isGameOver && room.hostId !== user.uid && (
                 <div className="bg-white/5 py-3 sm:py-4 px-6 sm:px-8 rounded-xl sm:rounded-2xl text-white/50 font-bold uppercase tracking-widest text-xs sm:text-sm w-full sm:w-auto">Host bekleniyor...</div>
               )}
               
               {isGameOver && (
                 <button 
                   onClick={() => { setRoute('landing'); setRoom(null); setRoomCode(''); }}
                   className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black py-3 sm:py-4 px-8 sm:px-12 rounded-xl sm:rounded-2xl shadow-lg transition-transform hover:scale-105 uppercase tracking-widest text-sm sm:text-base w-full sm:w-auto"
                 >
                   Ana Menüye Dön
                 </button>
               )}
            </div>
          </div>
        </div>

        {/* --- Modal: Kalan Kartlar --- */}
        {viewedPlayer && (
          <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm" onClick={() => setViewedPlayer(null)}>
            <div className="bg-slate-900 border border-white/10 p-4 sm:p-6 md:p-8 rounded-[1.5rem] sm:rounded-[2rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl relative custom-scrollbar" onClick={e => e.stopPropagation()}>
              <button onClick={() => setViewedPlayer(null)} className="absolute top-2 sm:top-4 right-4 sm:right-6 text-white/50 hover:text-white text-2xl sm:text-3xl font-bold">&times;</button>
              <h3 className="text-lg sm:text-2xl font-black mb-4 sm:mb-6 text-white flex items-center gap-2 sm:gap-3">
                <span className="text-2xl sm:text-4xl">{viewedPlayer.avatar}</span> <span className="truncate">{viewedPlayer.name}</span> - Kalan Kartlar
              </h3>
              
              {viewedPlayer.hand.length === 0 ? (
                <div className="text-emerald-400 font-bold text-base sm:text-xl py-6 sm:py-8 text-center bg-white/5 rounded-xl sm:rounded-2xl border border-white/5">Hiç kartı kalmadı! 🏆</div>
              ) : (
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  {viewedPlayer.hand.map((card, idx) => (
                    <div key={idx} className={`w-12 h-16 sm:w-16 sm:h-24 md:w-20 md:h-32 bg-white rounded-lg sm:rounded-xl border border-slate-200 flex flex-col justify-between p-1 sm:p-1.5 shadow-lg`}>
                      <div className={`text-[9px] sm:text-xs md:text-sm font-black leading-none ${getSuitColor(card.suit)}`}>{card.rank}</div>
                      <div className={`text-xl sm:text-2xl md:text-4xl self-center ${getSuitColor(card.suit)}`}>{getSuitSymbol(card.suit)}</div>
                      <div className={`text-[9px] sm:text-xs md:text-sm font-black leading-none rotate-180 ${getSuitColor(card.suit)}`}>{card.rank}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </BaseWrapper>
    );
  }

  return null;
}