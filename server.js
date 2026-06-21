// ========== 慢慢说 · 服务端 ==========
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const app = express();
const PORT = 3000;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.static(__dirname));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Upload directory for photo exchange
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer config for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'photo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } }); // max 5MB

// ========== HELPERS ==========
function getRoomPath(roomId) {
  return path.join(DATA_DIR, roomId + '.json');
}

function readRoom(roomId) {
  const p = getRoomPath(roomId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeRoom(roomId, data) {
  fs.writeFileSync(getRoomPath(roomId), JSON.stringify(data, null, 2), 'utf-8');
}

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MM-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ========== 每日一问 问题池 ==========
const dailyQuestionPool = [
  '今天最开心的一件事是什么？',
  '今天吃了什么好吃的？',
  '用一种颜色形容今天的心情，为什么？',
  '今天有没有一个瞬间特别想Ta？',
  '今天最想对Ta说的一句话是什么？',
  '你们第一次见面那天，Ta穿了什么？',
  '印象最深的一次见面是什么时候？',
  '下次见面，你最想一起做什么？',
  '你们最想去但还没一起去的地方是？',
  '如果今天是一部电影，片名是什么？',
  '用一种天气形容你们现在的关系',
  '如果明天世界末日，今天会怎么过？',
  '最近你发现Ta的一个新优点是什么？',
  '今天想感谢Ta的一件事是什么？',
  '猜猜Ta现在在做什么？'
];

// ========== 默契挑战 问题池 ==========
const challengePool = [
  'Ta最喜欢的颜色是什么？',
  'Ta最想去的旅行地是哪里？',
  'Ta觉得你们第一次见面那天你穿了什么？',
  'Ta最喜欢的食物是什么？',
  'Ta最近在追的剧或看的书是什么？',
  'Ta今天的情绪用一个词形容是什么？',
  'Ta最想和你一起做的一件事是什么？',
  'Ta觉得你身上最吸引Ta的地方是？',
  'Ta最常听的歌是哪首？',
  'Ta现在最需要的是什么？'
];

// ========== 真心话 话题池 ==========
const truthPool = [
  '最近一次被Ta感动是什么时候？',
  '有没有一件事你一直想告诉Ta但没说？',
  '你觉得Ta身上最让你欣赏的地方是？',
  '你们之间最让你怀念的一个瞬间是什么？',
  '如果用一个词形容你们的关系，是什么？',
  '你最近一次因为Ta笑了是什么时候？',
  '你觉得Ta最需要被理解的是什么？',
  '你希望Ta多做什么？少做什么？',
  '你最近在学着怎么更好地对Ta表达吗？',
  '有没有一个瞬间你觉得"有Ta真好"？'
];

function generateSignOfDay() {
  const signs = [
    { type: '一句话', content: '今天不用很完美，今天你已经在对方心里了。' },
    { type: '一句话', content: '想念不说出口，但月亮知道，Ta也知道。' },
    { type: '一句话', content: '你不需要时刻在线，但你一直在Ta心里在线。' },
    { type: '一件小事', content: '今天给对方发一条语音，只说四个字：我想你了。' },
    { type: '一件小事', content: '翻翻相册，找一张你们第一次见面的照片，发给Ta。' },
    { type: '一件小事', content: '今天不用打字，发一段只有你们懂的暗号或表情。' },
    { type: '一个问题', content: '如果现在你们在一起，你们会一起做什么？' },
    { type: '一个问题', content: '今天有什么事是你第一个想告诉Ta的？' },
    { type: '一个问题', content: '你们第一次见面那天，天气怎么样？' },
    { type: '一句话', content: '距离不是问题，心在一起，就不算分开。' },
    { type: '一件小事', content: '今天告诉对方一个你欣赏Ta的地方，一句就够了。' },
    { type: '一句话', content: '你不是一个人，你的今天，有人在意。' }
  ];
  return signs[Math.floor(Math.random() * signs.length)];
}

// ========== API: 创建房间 ==========
app.post('/api/room/create', (req, res) => {
  let roomId;
  let attempts = 0;
  do {
    roomId = generateRoomId();
    attempts++;
  } while (fs.existsSync(getRoomPath(roomId)) && attempts < 20);

  const roomData = {
    roomId: roomId,
    createdAt: new Date().toISOString(),
    signOfDay: generateSignOfDay(),
    members: {
      me: { glimmer: { status: '', text: '', time: '' }, lastSeen: '' },
      ta: { glimmer: { status: '', text: '', time: '' }, lastSeen: '' }
    },
    glimmerEntries: [],
    askRecords: [],
    whisperRecords: [],
    togetherRecords: [],
    dailyQuestion: dailyQuestionPool[Math.floor(Math.random() * dailyQuestionPool.length)],
    dailyQuestionAnswers: { me: '', ta: '' },
    dailyQuestionHistory: [],
    challengeQuestion: challengePool[Math.floor(Math.random() * challengePool.length)],
    challengeGuesses: { me: '', ta: '' },
    challengeAnswers: { me: '', ta: '' },
    challengeHistory: [],
    truthQuestion: truthPool[Math.floor(Math.random() * truthPool.length)],
    truthShares: { me: '', ta: '' },
    truthHistory: [],
    photoExchange: {
      me: { photoUrl: '', note: '', uploaded: false, timestamp: 0 },
      ta: { photoUrl: '', note: '', uploaded: false, timestamp: 0 }
    },
    photoHistory: [],
    version: 0
  };
  writeRoom(roomId, roomData);
  res.json({ success: true, roomId: roomId, roomData: roomData });
});

// ========== API: 加入房间 ==========
app.post('/api/room/join', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ success: false, error: '缺少房间码' });

  const roomData = readRoom(roomId.toUpperCase());
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  res.json({ success: true, roomData: roomData });
});

// ========== API: 获取房间数据 ==========
app.get('/api/room/:roomId', (req, res) => {
  const roomData = readRoom(req.params.roomId.toUpperCase());
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });
  res.json({ success: true, roomData: roomData });
});

// ========== API: 更新微光 ==========
app.post('/api/room/:roomId/glimmer', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { role, status, text, time } = req.body;
  const memberKey = role === 'ta' ? 'ta' : 'me';

  roomData.members[memberKey].glimmer = { status: status || '', text: text || '', time: time || '' };
  roomData.members[memberKey].lastSeen = new Date().toISOString();

  // Add to entries
  roomData.glimmerEntries.push({
    time: time,
    type: memberKey,
    status: status || '',
    text: text || '',
    date: new Date().toLocaleDateString('zh-CN'),
    timestamp: Date.now()
  });

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 问问Ta记录 ==========
app.post('/api/room/:roomId/ask', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { question, time, date } = req.body;
  roomData.askRecords.push({
    question: question,
    time: time,
    date: date || new Date().toLocaleDateString('zh-CN'),
    timestamp: Date.now()
  });

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 轻声说记录 ==========
app.post('/api/room/:roomId/whisper', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { time, type, summary, text, date } = req.body;
  roomData.whisperRecords.push({
    time: time,
    type: type,
    summary: summary || '',
    text: text || '',
    date: date || new Date().toLocaleDateString('zh-CN'),
    timestamp: Date.now()
  });

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 一起的事记录 ==========
app.post('/api/room/:roomId/together', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { item, time, date } = req.body;
  roomData.togetherRecords.push({
    item: item,
    time: time,
    date: date || new Date().toLocaleDateString('zh-CN'),
    timestamp: Date.now()
  });

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 每日一问 - 刷新问题 ==========
app.post('/api/room/:roomId/question', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  let newQ;
  do {
    newQ = dailyQuestionPool[Math.floor(Math.random() * dailyQuestionPool.length)];
  } while (newQ === roomData.dailyQuestion && dailyQuestionPool.length > 1);

  // Save current (if both answered) to history
  if (roomData.dailyQuestionAnswers.me && roomData.dailyQuestionAnswers.ta) {
    roomData.dailyQuestionHistory.push({
      question: roomData.dailyQuestion,
      me: roomData.dailyQuestionAnswers.me,
      ta: roomData.dailyQuestionAnswers.ta,
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now()
    });
  }

  roomData.dailyQuestion = newQ;
  roomData.dailyQuestionAnswers = { me: '', ta: '' };
  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version, dailyQuestion: newQ });
});

// ========== API: 每日一问 - 提交答案 ==========
app.post('/api/room/:roomId/answer', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { role, answer } = req.body;
  const memberKey = role === 'ta' ? 'ta' : 'me';
  roomData.dailyQuestionAnswers[memberKey] = answer || '';

  // If both answered, save to history
  if (roomData.dailyQuestionAnswers.me && roomData.dailyQuestionAnswers.ta) {
    roomData.dailyQuestionHistory.push({
      question: roomData.dailyQuestion,
      me: roomData.dailyQuestionAnswers.me,
      ta: roomData.dailyQuestionAnswers.ta,
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now()
    });
  }

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 默契挑战 - 刷新问题 ==========
app.post('/api/room/:roomId/challenge/question', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  // Check if one side is waiting
  var hasOneAnswer = (roomData.challengeGuesses.me || roomData.challengeAnswers.me) ||
                     (roomData.challengeGuesses.ta || roomData.challengeAnswers.ta);
  var bothDone = roomData.challengeGuesses.me && roomData.challengeAnswers.me &&
                 roomData.challengeGuesses.ta && roomData.challengeAnswers.ta;

  if (hasOneAnswer && !bothDone) {
    return res.json({ success: false, error: '等Ta回答完再换题吧', code: 'waiting' });
  }

  // Save current to history if both done
  if (bothDone) {
    roomData.challengeHistory.push({
      question: roomData.challengeQuestion,
      meGuess: roomData.challengeGuesses.me,
      meAnswer: roomData.challengeAnswers.me,
      taGuess: roomData.challengeGuesses.ta,
      taAnswer: roomData.challengeAnswers.ta,
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now()
    });
  }

  let newQ;
  do { newQ = challengePool[Math.floor(Math.random() * challengePool.length)]; }
  while (newQ === roomData.challengeQuestion && challengePool.length > 1);

  roomData.challengeQuestion = newQ;
  roomData.challengeGuesses = { me: '', ta: '' };
  roomData.challengeAnswers = { me: '', ta: '' };
  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version, challengeQuestion: newQ });
});

// ========== API: 默契挑战 - 猜Ta的答案 ==========
app.post('/api/room/:roomId/challenge/guess', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { role, guess } = req.body;
  const memberKey = role === 'ta' ? 'ta' : 'me';
  roomData.challengeGuesses[memberKey] = guess || '';

  // Check if both guessed and both answered
  if (roomData.challengeGuesses.me && roomData.challengeGuesses.ta &&
      roomData.challengeAnswers.me && roomData.challengeAnswers.ta) {
    roomData.challengeHistory.push({
      question: roomData.challengeQuestion,
      meGuess: roomData.challengeGuesses.me,
      meAnswer: roomData.challengeAnswers.me,
      taGuess: roomData.challengeGuesses.ta,
      taAnswer: roomData.challengeAnswers.ta,
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now()
    });
  }

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 默契挑战 - 回答真实答案 ==========
app.post('/api/room/:roomId/challenge/answer', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { role, answer } = req.body;
  const memberKey = role === 'ta' ? 'ta' : 'me';
  roomData.challengeAnswers[memberKey] = answer || '';

  if (roomData.challengeGuesses.me && roomData.challengeGuesses.ta &&
      roomData.challengeAnswers.me && roomData.challengeAnswers.ta) {
    roomData.challengeHistory.push({
      question: roomData.challengeQuestion,
      meGuess: roomData.challengeGuesses.me,
      meAnswer: roomData.challengeAnswers.me,
      taGuess: roomData.challengeGuesses.ta,
      taAnswer: roomData.challengeAnswers.ta,
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now()
    });
  }

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 真心话 - 刷新话题 ==========
app.post('/api/room/:roomId/truth/question', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  // Save current to history if anyone shared
  if (roomData.truthShares.me || roomData.truthShares.ta) {
    roomData.truthHistory.push({
      question: roomData.truthQuestion,
      me: roomData.truthShares.me || '',
      ta: roomData.truthShares.ta || '',
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now()
    });
  }

  let newQ;
  do { newQ = truthPool[Math.floor(Math.random() * truthPool.length)]; }
  while (newQ === roomData.truthQuestion && truthPool.length > 1);

  roomData.truthQuestion = newQ;
  roomData.truthShares = { me: '', ta: '' };
  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version, truthQuestion: newQ });
});

// ========== API: 真心话 - 分享 ==========
app.post('/api/room/:roomId/truth/share', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { role, text } = req.body;
  const memberKey = role === 'ta' ? 'ta' : 'me';
  roomData.truthShares[memberKey] = text || '';

  // If both shared, save to history
  if (roomData.truthShares.me && roomData.truthShares.ta) {
    roomData.truthHistory.push({
      question: roomData.truthQuestion,
      me: roomData.truthShares.me,
      ta: roomData.truthShares.ta,
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now()
    });
  }

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 图片交换 - 上传图片 ==========
app.post('/api/room/:roomId/photo/upload', upload.single('photo'), (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const { role, note } = req.body;
  const memberKey = role === 'ta' ? 'ta' : 'me';

  if (!req.file) return res.status(400).json({ success: false, error: '没有上传图片' });

  const photoUrl = '/uploads/' + req.file.filename;
  const now = Date.now();
  roomData.photoExchange[memberKey] = {
    photoUrl: photoUrl,
    note: note || '',
    uploaded: true,
    timestamp: now
  };

  // 如果双方都已上传，归档到历史记录
  if (roomData.photoExchange.me.uploaded && roomData.photoExchange.ta.uploaded) {
    roomData.photoHistory.push({
      date: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      timestamp: now,
      me: { photoUrl: roomData.photoExchange.me.photoUrl, note: roomData.photoExchange.me.note },
      ta: { photoUrl: roomData.photoExchange.ta.photoUrl, note: roomData.photoExchange.ta.note }
    });
  }

  roomData.version = now;
  writeRoom(roomId, roomData);
  res.json({ success: true, photoUrl: photoUrl, version: roomData.version });
});

// ========== API: 图片交换 - 重置（双方查看后） ==========
app.post('/api/room/:roomId/photo/reset', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  // 如果双方都已上传但还没归档（理论上upload时已归档，这里做兜底）
  if (roomData.photoExchange.me.uploaded && roomData.photoExchange.ta.uploaded) {
    const alreadyArchived = roomData.photoHistory.some(function(h) {
      return h.me.photoUrl === roomData.photoExchange.me.photoUrl &&
             h.ta.photoUrl === roomData.photoExchange.ta.photoUrl;
    });
    if (!alreadyArchived) {
      roomData.photoHistory.push({
        date: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        timestamp: Date.now(),
        me: { photoUrl: roomData.photoExchange.me.photoUrl, note: roomData.photoExchange.me.note },
        ta: { photoUrl: roomData.photoExchange.ta.photoUrl, note: roomData.photoExchange.ta.note }
      });
    }
  }

  roomData.photoExchange = {
    me: { photoUrl: '', note: '', uploaded: false, timestamp: 0 },
    ta: { photoUrl: '', note: '', uploaded: false, timestamp: 0 }
  };

  roomData.version = Date.now();
  writeRoom(roomId, roomData);
  res.json({ success: true, version: roomData.version });
});

// ========== API: 轮询更新 ==========
app.get('/api/room/:roomId/poll', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const since = parseInt(req.query.since) || 0;
  const role = req.query.role || 'me';

  // Return full room data if there are updates
  const hasUpdates = roomData.version > since;

  res.json({
    success: true,
    hasUpdates: hasUpdates,
    version: roomData.version,
    roomData: hasUpdates ? roomData : null,
    dailyQuestion: roomData.dailyQuestion,
    dailyQuestionAnswers: roomData.dailyQuestionAnswers,
    dailyQuestionHistory: roomData.dailyQuestionHistory,
    challengeQuestion: roomData.challengeQuestion,
    challengeGuesses: roomData.challengeGuesses,
    challengeAnswers: roomData.challengeAnswers,
    challengeHistory: roomData.challengeHistory,
    truthQuestion: roomData.truthQuestion,
    truthShares: roomData.truthShares,
    truthHistory: roomData.truthHistory,
    photoExchange: roomData.photoExchange,
    photoHistory: roomData.photoHistory || []
  });
});

// ========== START ==========
app.listen(PORT, () => {
  console.log('慢慢说服务端已启动: http://localhost:' + PORT);
  console.log('数据目录: ' + DATA_DIR);
});