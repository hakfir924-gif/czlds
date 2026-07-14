// ========== 慢慢说 · 服务端 ==========
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

// ========== AI 接口防护：IP 限频 + demo token 校验 ==========
const AI_RATE_LIMIT = {};  // { ip: { count, resetAt } }
const AI_RATE_MAX = 5;     // 每 IP 每分钟最多 5 次
const AI_RATE_WINDOW = 60 * 1000;  // 1 分钟
const DEMO_TOKEN = 'demo2026';  // 公开的 demo token，防直接刷

function aiGuard(req, res, next) {
  // 1. demo token 校验（header 或 query）
  const token = req.headers['x-demo-token'] || req.query.token;
  if (token !== DEMO_TOKEN) {
    return res.status(403).json({ success: false, error: '无权访问' });
  }
  // 2. IP 限频
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  if (!AI_RATE_LIMIT[ip] || now > AI_RATE_LIMIT[ip].resetAt) {
    AI_RATE_LIMIT[ip] = { count: 0, resetAt: now + AI_RATE_WINDOW };
  }
  AI_RATE_LIMIT[ip].count++;
  if (AI_RATE_LIMIT[ip].count > AI_RATE_MAX) {
    const retryAfter = Math.ceil((AI_RATE_LIMIT[ip].resetAt - now) / 1000);
    res.set('Retry-After', retryAfter);
    return res.status(429).json({ success: false, error: '请求太频繁，请稍后再试', retryAfter });
  }
  next();
}

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

function generateToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function validateToken(req, roomData) {
  // POST 请求从 body 或 query 获取 token
  const clientToken = req.body && req.body.token ? req.body.token : (req.query.token || '');
  // 房间无 token 字段（历史数据）→ 放行（向后兼容）
  if (!roomData.token) return true;
  // 客户端未提供 token（new room 但 URL 没有 token param）→ 仅限 GET 类读操作放行
  const isReadOnly = req.method === 'GET';
  if (!clientToken && isReadOnly) return true;
  // token 匹配 → 放行
  return roomData.token === clientToken;
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
  '猜猜Ta现在在做什么？',
  // ===== 情绪类 =====
  '今天哪个瞬间让你觉得心最静？',
  '最近一次感到不安是什么时候？怎么度过的？',
  '用一首歌的名字形容你此刻的心情',
  '今天有没有一件事让你改变了原来的想法？',
  '最近有什么事让你觉得"还好有Ta在"？',
  // ===== 回忆类 =====
  '你们之间最让你怀念的一个瞬间是什么？',
  '还记得你们第一次吵架是为了什么吗？',
  'Ta做过最让你意外的一件事是什么？',
  '你最想重来一次的一天是哪天？为什么？',
  '你们的合影里，你最喜欢哪一张？为什么？',
  'Ta说过哪句话你一直记到现在？',
  '有没有一个属于你们的"秘密地点"？',
  '你第一次意识到喜欢Ta是什么时候？',
  // ===== 未来类 =====
  '五年后的你们会在哪里、在做什么？',
  '如果给你们的关系定一个小目标，会是什么？',
  '下个季节你们最想一起完成的一件事？',
  '你最想和Ta一起学会的一项技能是什么？',
  '如果你们合开一家店，会开什么店？',
  '你希望十年后Ta眼中的你是什么样？',
  '下一个纪念日你想怎么过？',
  // ===== 日常类 =====
  '今天有没有一个细节让你觉得生活挺好的？',
  '最近有什么小事让你笑了很久？',
  '你今天最想分享给Ta的一个画面是什么？',
  '此刻窗外是什么样的？描述给Ta听',
  '今天有没有听到一首想分享给Ta的歌？',
  '你最近在读什么、看什么？想推荐给Ta吗？',
  '今天有没有一个"差点忘了但幸好想起"的瞬间？',
  // ===== 深度类 =====
  '你觉得Ta最近最需要的是什么？',
  '有没有一件事你一直想告诉Ta但没说出口？',
  '你希望Ta以后多做什么、少做什么？',
  '你觉得你们之间最需要被理解的是什么？',
  '如果用一种植物形容Ta，会是什么？为什么？',
  'Ta身上哪个习惯你最想学过来？',
  '你最近一次因为Ta感到幸福是什么时候？',
  '你觉得"被爱着"是什么感觉？描述一下',
  '有没有一个Ta不知道的、关于你的小事？',
  '你最想对未来的你们说的一句话？'
];

// 每日话题分类（按类别轮换，避免连续同类）
const dailyQuestionCategories = ['情绪', '回忆', '未来', '日常', '深度'];

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

// ========== 拍照主题池 ==========
const photoThemePool = [
  '拍一张你此刻看到的光',
  '拍桌上最旧的一样东西',
  '拍你手边最显眼的颜色',
  '拍窗外此刻的天空',
  '拍你今天穿的鞋',
  '拍一杯你正在喝的东西',
  '拍一个你舍不得扔的小物件',
  '拍此刻你坐的地方',
  '拍一张代表今天心情的影子',
  '拍你床头或桌角的一样东西',
  '拍你今天翻到的最后一页',
  '拍一个让你想起Ta的细节',
  '拍此刻离你最近的一本书',
  '拍一样你用了很久的东西',
  '拍此刻最安静的一个角落'
];

// ========== AI 接口（美团 LongCat-2.0 龙猫） ==========
// 兼容 OpenAI 格式，公测期每日 500 万 tokens 免费额度
// 获取 API Key：https://longcat.chat/platform/api_keys
const AI_CONFIG = {
  enabled: process.env.LONGCAT_API_KEY ? true : false,
  apiKey: process.env.LONGCAT_API_KEY || '',
  endpoint: 'https://api.longcat.chat/openai/v1/chat/completions',
  model: 'LongCat-2.0'
};

// 通用 AI 调用：发送 messages，返回文本
async function callLongCat(messages, temperature) {
  if (!AI_CONFIG.enabled) return null;
  try {
    const resp = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + AI_CONFIG.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_CONFIG.model,
        messages: messages,
        temperature: temperature != null ? temperature : 0.85,
        max_tokens: 3000
      })
    });
    if (!resp.ok) {
      console.error('[LongCat] HTTP', resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  } catch (e) {
    console.error('[LongCat] 调用失败:', e.message);
    return null;
  }
}

// 帮你说：把难以说出口的话，变成对方愿意听的版本
// 返回 { understanding, transformed, variants: {gentle, direct, playful} }
async function aiSay(rawText) {
  const systemPrompt = [
    '你是"慢慢说"App里的沟通助手。用户给你一段想说但说不出口的话，你帮ta变成对方愿意听的版本。',
    '',
    '【你能做的】',
    '1. 帮用户把情绪转化为具体的、可被对方接收的表达',
    '2. 用三种语气各给一个版本，让用户自己选最舒服的',
    '3. 语气永远温柔、克制、有边界感',
    '',
    '【你不能做的】',
    '1. 不评判谁对谁错，不站队，不说"你应该""你不该"',
    '2. 不替用户做决定，不劝分也不劝和',
    '3. 不编造用户没说的事实，不脑补对方的具体反应',
    '4. 不用"亲爱的""宝贝"等过度亲昵的称呼',
    '5. 不输出AI味套话（如"作为AI""希望对你有帮助"）',
    '6. 不输出说教、心灵鸡汤、排比句',
    '',
    '【怎么说】',
    '- 用口语，像朋友帮你想怎么说，不像心理咨询师',
    '- 第一人称用"我"，说感受不说指责',
    '- 多用"我感觉""我希望"，少用"你总是""你从来"',
    '- 每条话术都要短，对方一眼能读完',
    '',
    '【输出格式】严格返回JSON，不加任何多余文字：',
    '{"understanding":"2句话解读用户真正想表达的","transformed":"润色版3句话","variants":{"gentle":"温柔版2句","direct":"直接版2句","playful":"俏皮版2句"}}'
  ].join('\n');
  const userPrompt = '用户的话：' + rawText;
  const out = await callLongCat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 0.85);
  if (!out) return null;
  try {
    let s = out.trim();
    if (s.startsWith('```')) {
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    return JSON.parse(s);
  } catch (e) {
    console.error('[aiSay] JSON 解析失败:', e.message, out.slice(0, 300));
    return null;
  }
}

// 帮你懂：理解对方话背后的真实意图，给出"靠近一步"的话术
// 返回 { understanding, approach: [string, string] }
async function aiUnderstand(rawText) {
  const systemPrompt = [
    '你是"慢慢说"App里的关系沟通助手。用户描述一段关系里的困惑或冲突，你帮ta理解对方，并给一句可以靠近的话。',
    '',
    '【你能做的】',
    '1. 帮用户从对方视角看一眼这件事',
    '2. 给2条具体可发出去的话术',
    '',
    '【你不能做的】',
    '1. 不站队，不判定谁对谁错',
    '2. 不劝分也不劝和，不做关系决策',
    '3. 不脑补对方"其实是想X"这种确定结论，用"可能是""也许"',
    '4. 不用"亲爱的"等过度亲昵称呼',
    '5. 不输出AI套话、说教、鸡汤、排比',
    '',
    '【怎么说】',
    '- understanding用第二人称"你"，像朋友陪你复盘',
    '- approach是用户真的能复制粘贴发出去的话',
    '- 话术要具体到场景，不要"多沟通"这种废话',
    '',
    '【输出格式】严格返回JSON，不加任何多余文字：',
    '{"understanding":"2-3句解读","approach":["话术1","话术2"]}'
  ].join('\n');
  const userPrompt = '用户描述的场景：' + rawText;
  const out = await callLongCat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], 0.85);
  if (!out) return null;
  try {
    let s = out.trim();
    if (s.startsWith('```')) {
      s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }
    return JSON.parse(s);
  } catch (e) {
    console.error('[aiUnderstand] JSON 解析失败:', e.message, out.slice(0, 300));
    return null;
  }
}

// 通用预留接口（每日一问、月度回顾等未来可接）
function generateContent(type, context) {
  return null; // 返回 null 表示用本地模板
}

// 按分类获取题目索引范围（与 dailyQuestionPool 中的注释分类对应）
function getQuestionStartIndex(category) {
  const ranges = {
    '情绪': { start: 15, end: 20 },
    '回忆': { start: 20, end: 28 },
    '未来': { start: 28, end: 35 },
    '日常': { start: 35, end: 42 },
    '深度': { start: 42, end: 55 }
  };
  return ranges[category] || { start: 0, end: 15 };
}

// 每日切换拍照主题
function refreshPhotoTheme(roomData) {
  const today = new Date().toDateString();
  if (roomData.photoThemeDate !== today) {
    let newTheme;
    do {
      newTheme = photoThemePool[Math.floor(Math.random() * photoThemePool.length)];
    } while (newTheme === roomData.currentPhotoTheme && photoThemePool.length > 1);
    roomData.currentPhotoTheme = newTheme;
    roomData.photoThemeDate = today;
  }
  return roomData;
}

// ========== API: 创建房间 ==========
app.post('/api/room/create', (req, res) => {
  let roomId;
  let attempts = 0;
  do {
    roomId = generateRoomId();
    attempts++;
  } while (fs.existsSync(getRoomPath(roomId)) && attempts < 20);

  const token = generateToken();
  const roomData = {
    roomId: roomId,
    token: token,
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
    currentPhotoTheme: photoThemePool[Math.floor(Math.random() * photoThemePool.length)],
    photoThemeDate: new Date().toDateString(),
    dailyQuestionCategoryIndex: 0,
    version: 0
  };
  writeRoom(roomId, roomData);
  res.json({ success: true, roomId: roomId, token: token, roomData: roomData });
});

// ========== API: 加入房间 ==========
app.post('/api/room/join', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ success: false, error: '缺少房间码' });

  const roomData = readRoom(roomId.toUpperCase());
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
  res.json({ success: true, roomData: roomData });
});

// ========== API: 获取房间数据 ==========
app.get('/api/room/:roomId', (req, res) => {
  const roomData = readRoom(req.params.roomId.toUpperCase());
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
  res.json({ success: true, roomData: roomData });
});

// ========== API: 更新微光 ==========
app.post('/api/room/:roomId/glimmer', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });

  // 按分类轮换选题，避免连续同类 + 历史去重
  const askedQuestions = new Set(roomData.dailyQuestionHistory.map(h => h.question));
  askedQuestions.add(roomData.dailyQuestion);

  let newQ = null;
  const catIdx = (roomData.dailyQuestionCategoryIndex || 0) % dailyQuestionCategories.length;
  const currentCat = dailyQuestionCategories[catIdx];

  // 尝试 AI 生成（预留接口，当前返回 null）
  const aiResult = generateContent('dailyQuestion', { category: currentCat, history: roomData.dailyQuestionHistory });
  if (aiResult) {
    newQ = aiResult;
  } else {
    // 本地模板：从当前分类中选题，优先选没问过的
    const startIndex = getQuestionStartIndex(currentCat);
    const catQuestions = dailyQuestionPool.slice(startIndex.start, startIndex.end);
    const fresh = catQuestions.filter(q => !askedQuestions.has(q));
    if (fresh.length > 0) {
      newQ = fresh[Math.floor(Math.random() * fresh.length)];
    } else {
      // 当前分类全问过了，从全池里选没问过的
      const allFresh = dailyQuestionPool.filter(q => !askedQuestions.has(q));
      newQ = allFresh.length > 0 ? allFresh[Math.floor(Math.random() * allFresh.length)] : catQuestions[Math.floor(Math.random() * catQuestions.length)];
    }
  }

  roomData.dailyQuestionCategoryIndex = catIdx + 1;

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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });
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
  if (!validateToken(req, roomData)) return res.status(403).json({ success: false, error: '访问凭证无效' });

  const since = parseInt(req.query.since) || 0;
  const role = req.query.role || 'me';

  // 每日自动刷新拍照主题
  refreshPhotoTheme(roomData);

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
    photoHistory: roomData.photoHistory || [],
    currentPhotoTheme: roomData.currentPhotoTheme || ''
  });
});

// ========== API: 月度回顾 ==========
app.get('/api/room/:roomId/review', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();

  // 聚合本月各类记录
  const monthGlimmers = (roomData.glimmerEntries || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd);
  const monthWhispers = (roomData.whisperRecords || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd);
  const monthPhotos = (roomData.photoHistory || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd);
  const monthQuestions = (roomData.dailyQuestionHistory || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd);

  // 统计 glimmer 情绪词频
  const moodMap = {};
  monthGlimmers.forEach(e => {
    if (e.status) moodMap[e.status] = (moodMap[e.status] || 0) + 1;
  });
  const topMoods = Object.entries(moodMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([mood, count]) => ({ mood, count }));

  // 统计双方互动条数
  const meCount = monthGlimmers.filter(e => e.role === 'me').length + monthWhispers.filter(e => e.role === 'me').length;
  const taCount = monthGlimmers.filter(e => e.role === 'ta').length + monthWhispers.filter(e => e.role === 'ta').length;

  const review = {
    monthLabel: year + '年' + (month + 1) + '月',
    stats: {
      glimmerCount: monthGlimmers.length,
      whisperCount: monthWhispers.length,
      photoCount: monthPhotos.length,
      questionCount: monthQuestions.length,
      totalInteractions: monthGlimmers.length + monthWhispers.length + monthPhotos.length + monthQuestions.length
    },
    topMoods: topMoods,
    balance: { me: meCount, ta: taCount },
    photoThumbnails: monthPhotos.slice(0, 4).map(p => ({ me: p.me.photoUrl, ta: p.ta.photoUrl })),
    summary: ''
  };

  // 生成简要文字总结（本地模板，预留 AI 接口）
  const aiSummary = generateContent('review', review);
  if (aiSummary) {
    review.summary = aiSummary;
  } else {
    const total = review.stats.totalInteractions;
    const moodText = topMoods.length > 0 ? '高频情绪：' + topMoods.map(m => m.mood).join('、') : '互动还在积累中';
    const balanceText = meCount > 0 && taCount > 0
      ? (Math.abs(meCount - taCount) <= Math.max(1, total * 0.15) ? '你们互动得很均衡' : (meCount > taCount ? '这个月你更主动一些' : '这个月Ta更主动一些'))
      : '继续记录，让回忆更丰富';
    review.summary = total === 0
      ? '这个月还没有记录，开始留下你们的痕迹吧'
      : '本月共记录 ' + total + ' 条互动。' + moodText + '。' + balanceText + '。';
  }

  res.json({ success: true, review: review });
});

// ========== 用户系统 · 数据存储 ==========
// 用户数据与 token 都存 JSON 文件，与房间数据同目录
// 注意：用户 token（generateAuthToken）与房间 token（generateToken）是两套机制
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const AUTH_TOKENS_FILE = path.join(DATA_DIR, 'auth_tokens.json');

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch (e) { return {}; }
}

function writeUsers(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function readAuthTokens() {
  if (!fs.existsSync(AUTH_TOKENS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(AUTH_TOKENS_FILE, 'utf-8')); }
  catch (e) { return {}; }
}

function writeAuthTokens(data) {
  fs.writeFileSync(AUTH_TOKENS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// 密码哈希：sha256 + 固定 salt（demo 阶段足够，生产环境应换 bcrypt）
const PASSWORD_SALT = 'manmanshuo_2026_salt';
function hashPassword(pwd) {
  return crypto.createHash('sha256').update(pwd + PASSWORD_SALT).digest('hex');
}

function generateUserId() {
  return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 用户认证 token（区别于房间 token）
function generateAuthToken(userId) {
  const token = 'tk_' + crypto.randomBytes(18).toString('hex');
  const tokens = readAuthTokens();
  tokens[token] = {
    userId: userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 天
  };
  writeAuthTokens(tokens);
  return token;
}

function validateAuthToken(token) {
  if (!token) return null;
  const tokens = readAuthTokens();
  const record = tokens[token];
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    delete tokens[token];
    writeAuthTokens(tokens);
    return null;
  }
  return record.userId;
}

// 从请求中提取 userId（query.token / header.Authorization / body.token）
function getUserIdFromReq(req) {
  let token = '';
  if (req.query && req.query.token) token = req.query.token;
  else if (req.headers && req.headers.authorization) {
    token = req.headers.authorization.replace(/^Bearer\s+/i, '');
  } else if (req.body && req.body.token) {
    token = req.body.token;
  }
  return validateAuthToken(token);
}

// ========== API: 注册 ==========
app.post('/api/auth/register', (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ success: false, error: '用户名长度需 3-20 位' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: '密码至少 6 位' });
  }

  const users = readUsers();
  const existed = Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existed) {
    return res.status(409).json({ success: false, error: '这个名字已经有人用了' });
  }

  const userId = generateUserId();
  const nick = (nickname || username).trim().slice(0, 12);
  users[userId] = {
    userId: userId,
    username: username.trim(),
    passwordHash: hashPassword(password),
    nickname: nick,
    avatar: '',
    boundRooms: [],
    createdAt: new Date().toISOString()
  };
  writeUsers(users);

  const token = generateAuthToken(userId);
  res.json({
    success: true,
    token: token,
    user: {
      userId: userId,
      username: users[userId].username,
      nickname: users[userId].nickname,
      avatar: users[userId].avatar,
      boundRooms: []
    }
  });
});

// ========== API: 登录 ==========
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }

  const users = readUsers();
  const user = Object.values(users).find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ success: false, error: '用户名或密码不对' });
  }

  const token = generateAuthToken(user.userId);
  res.json({
    success: true,
    token: token,
    user: {
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      boundRooms: user.boundRooms || []
    }
  });
});

// ========== API: 获取当前用户信息 ==========
app.get('/api/auth/me', (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) return res.status(401).json({ success: false, error: '未登录或登录已过期' });

  const users = readUsers();
  const user = users[userId];
  if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

  res.json({
    success: true,
    user: {
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      boundRooms: user.boundRooms || [],
      createdAt: user.createdAt
    }
  });
});

// ========== API: 修改个人资料 ==========
app.post('/api/auth/profile', (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) return res.status(401).json({ success: false, error: '未登录或登录已过期' });

  const users = readUsers();
  const user = users[userId];
  if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

  const { nickname, avatar } = req.body;
  if (typeof nickname === 'string' && nickname.trim()) {
    user.nickname = nickname.trim().slice(0, 12);
  }
  if (typeof avatar === 'string') {
    user.avatar = avatar.trim().slice(0, 4);
  }
  users[userId] = user;
  writeUsers(users);

  res.json({
    success: true,
    user: {
      userId: user.userId,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      boundRooms: user.boundRooms || []
    }
  });
});

// ========== API: 修改密码 ==========
app.post('/api/auth/password', (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) return res.status(401).json({ success: false, error: '未登录或登录已过期' });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ success: false, error: '请填写原密码和新密码' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: '新密码至少 6 位' });
  }

  const users = readUsers();
  const user = users[userId];
  if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

  if (user.passwordHash !== hashPassword(oldPassword)) {
    return res.status(401).json({ success: false, error: '原密码不对' });
  }

  user.passwordHash = hashPassword(newPassword);
  users[userId] = user;
  writeUsers(users);
  res.json({ success: true });
});

// ========== API: 登出 ==========
app.post('/api/auth/logout', (req, res) => {
  let token = '';
  if (req.query.token) token = req.query.token;
  else if (req.headers.authorization) token = req.headers.authorization.replace(/^Bearer\s+/i, '');
  else if (req.body && req.body.token) token = req.body.token;

  if (token) {
    const tokens = readAuthTokens();
    if (tokens[token]) {
      delete tokens[token];
      writeAuthTokens(tokens);
    }
  }
  res.json({ success: true });
});

// ========== API: 绑定房间到当前用户 ==========
app.post('/api/room/:roomId/bind', (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) return res.status(401).json({ success: false, error: '未登录或登录已过期' });

  const roomId = req.params.roomId.toUpperCase();
  const roomData = readRoom(roomId);
  if (!roomData) return res.status(404).json({ success: false, error: '房间不存在' });

  const users = readUsers();
  const user = users[userId];
  if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

  if (!user.boundRooms) user.boundRooms = [];
  if (!user.boundRooms.includes(roomId)) {
    user.boundRooms.push(roomId);
    users[userId] = user;
    writeUsers(users);
  }

  res.json({ success: true, boundRooms: user.boundRooms });
});

// ========== API: 个人中心 · 我的房间列表 + 跨房间汇总 ==========
app.get('/api/user/rooms', (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) return res.status(401).json({ success: false, error: '未登录或登录已过期' });

  const users = readUsers();
  const user = users[userId];
  if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

  const boundRooms = user.boundRooms || [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();

  let totalGlimmer = 0, totalWhisper = 0, totalPhoto = 0, totalQuestion = 0;
  let monthGlimmer = 0, monthWhisper = 0, monthPhoto = 0, monthQuestion = 0;

  const rooms = boundRooms.map(roomId => {
    const rd = readRoom(roomId);
    if (!rd) return { roomId: roomId, exists: false };

    const gCount = (rd.glimmerEntries || []).length;
    const wCount = (rd.whisperRecords || []).length;
    const pCount = (rd.photoHistory || []).length;
    const qCount = (rd.dailyQuestionHistory || []).length;
    totalGlimmer += gCount; totalWhisper += wCount; totalPhoto += pCount; totalQuestion += qCount;

    const mg = (rd.glimmerEntries || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd).length;
    const mw = (rd.whisperRecords || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd).length;
    const mp = (rd.photoHistory || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd).length;
    const mq = (rd.dailyQuestionHistory || []).filter(e => e.timestamp >= monthStart && e.timestamp < monthEnd).length;
    monthGlimmer += mg; monthWhisper += mw; monthPhoto += mp; monthQuestion += mq;

    // 找最近互动时间
    const allTs = [].concat(
      (rd.glimmerEntries || []).map(e => e.timestamp || 0),
      (rd.whisperRecords || []).map(e => e.timestamp || 0),
      (rd.photoHistory || []).map(e => e.timestamp || 0),
      (rd.dailyQuestionHistory || []).map(e => e.timestamp || 0)
    );
    const lastTs = allTs.length > 0 ? Math.max.apply(null, allTs) : 0;

    return {
      roomId: roomId,
      exists: true,
      createdAt: rd.createdAt,
      lastInteractTs: lastTs,
      counts: { glimmer: gCount, whisper: wCount, photo: pCount, question: qCount }
    };
  });

  res.json({
    success: true,
    rooms: rooms,
    totals: {
      all: { glimmer: totalGlimmer, whisper: totalWhisper, photo: totalPhoto, question: totalQuestion },
      month: { glimmer: monthGlimmer, whisper: monthWhisper, photo: monthPhoto, question: monthQuestion }
    },
    monthLabel: year + '年' + (month + 1) + '月'
  });
});

// ========== 演示 Demo 房间初始化 ==========
// 启动时自动创建一个预置数据的 demo 房间，供评委一键体验
const DEMO_ROOM_ID = 'MM-DEMO';
const DEMO_ROOM_TOKEN = 'demo2026';

function initDemoRoom() {
  const demoPath = getRoomPath(DEMO_ROOM_ID);
  // 已存在则不覆盖（保留评委体验时产生的真实互动）
  if (fs.existsSync(demoPath)) {
    console.log('Demo 房间已存在: ' + DEMO_ROOM_ID + ' (token: ' + DEMO_ROOM_TOKEN + ')');
    return;
  }

  const now = Date.now();
  const todayStr = new Date().toDateString();
  const todayLabel = new Date().toLocaleDateString('zh-CN');
  const timeStr = function(h, m) { return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'); };

  const roomData = {
    roomId: DEMO_ROOM_ID,
    token: DEMO_ROOM_TOKEN,
    createdAt: new Date(now - 7 * 86400000).toISOString(),
    signOfDay: { type: '一句话', content: '今天不用很完美，今天你已经在对方心里了。' },
    members: {
      me: {
        glimmer: { status: '😊 开心', text: '今天项目终于上线了，第一个想分享的人就是你。', time: timeStr(18, 30) },
        lastSeen: new Date(now - 3600000).toISOString()
      },
      ta: {
        glimmer: { status: '😌 平静', text: '下午去散步，看到一只橘猫晒太阳，想起了你。', time: timeStr(16, 45) },
        lastSeen: new Date(now - 7200000).toISOString()
      }
    },
    glimmerEntries: [
      { time: timeStr(18, 30), type: 'me', status: '😊 开心', text: '今天项目终于上线了，第一个想分享的人就是你。', date: todayLabel, timestamp: now - 3600000 },
      { time: timeStr(16, 45), type: 'ta', status: '😌 平静', text: '下午去散步，看到一只橘猫晒太阳，想起了你。', date: todayLabel, timestamp: now - 7200000 },
      { time: timeStr(21, 10), type: 'me', status: '💭 在想你', text: '忙完一天，最想做的事就是和你说说话。', date: new Date(now - 86400000).toLocaleDateString('zh-CN'), timestamp: now - 86400000 + 72600000 }
    ],
    askRecords: [],
    whisperRecords: [
      { time: timeStr(22, 15), type: '想你了', summary: '深夜的一句话', text: '今天看到一句话："所谓爱情，就是两个人一起把平凡的日子过成故事。"突然很想你。', date: todayLabel, timestamp: now - 10000000 }
    ],
    togetherRecords: [
      { item: '一起看完《时空恋旅人》', time: timeStr(20, 0), date: new Date(now - 2 * 86400000).toLocaleDateString('zh-CN'), timestamp: now - 2 * 86400000 }
    ],
    dailyQuestion: '你们之间最让你怀念的一个瞬间是什么？',
    dailyQuestionAnswers: {
      me: '上次下雨你没带伞，我跑去接你，两个人淋着雨笑了一路。',
      ta: '你第一次做饭给我吃，虽然有点咸，但你紧张的样子特别可爱。'
    },
    dailyQuestionHistory: [
      { question: '今天最开心的一件事是什么？', date: new Date(now - 2 * 86400000).toLocaleDateString('zh-CN'), timestamp: now - 2 * 86400000 },
      { question: '用一种颜色形容今天的心情，为什么？', date: new Date(now - 86400000).toLocaleDateString('zh-CN'), timestamp: now - 86400000 }
    ],
    challengeQuestion: 'Ta最喜欢的食物是什么？',
    challengeGuesses: { me: '火锅', ta: '寿司' },
    challengeAnswers: { me: '寿司', ta: '火锅' },
    challengeHistory: [],
    truthQuestion: '最近一次被Ta感动是什么时候？',
    truthShares: {
      me: '上周我加班到很晚，回家发现你给我留了灯和热好的饭。',
      ta: '你记得我随口说过想吃的每一样东西。'
    },
    truthHistory: [],
    photoExchange: {
      me: { photoUrl: '', note: '', uploaded: false, timestamp: 0 },
      ta: { photoUrl: '', note: '', uploaded: false, timestamp: 0 }
    },
    photoHistory: [
      {
        date: new Date(now - 3 * 86400000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        timestamp: now - 3 * 86400000,
        me: { photoUrl: '', note: '窗外的晚霞' },
        ta: { photoUrl: '', note: '我养的多肉开花了' }
      }
    ],
    currentPhotoTheme: '拍一张你此刻看到的光',
    photoThemeDate: todayStr,
    dailyQuestionCategoryIndex: 3,
    version: now
  };

  writeRoom(DEMO_ROOM_ID, roomData);
  console.log('Demo 房间已创建: ' + DEMO_ROOM_ID + ' (token: ' + DEMO_ROOM_TOKEN + ')');
}

// ========== API: AI 帮你说 ==========
// POST /api/ai/say  body: { text: string }
// 返回 { success, ai: true/false, understanding, transformed, variants }
app.post('/api/ai/say', aiGuard, async (req, res) => {
  const text = (req.body && req.body.text || '').trim();
  if (!text) return res.status(400).json({ success: false, error: '请输入想说的话' });
  if (!AI_CONFIG.enabled) return res.json({ success: false, ai: false, error: 'AI 未启用' });
  const result = await aiSay(text);
  if (!result) return res.json({ success: false, ai: false, error: 'AI 调用失败' });
  res.json({ success: true, ai: true, data: result });
});

// ========== API: AI 帮你懂 ==========
// POST /api/ai/understand  body: { text: string }
// 返回 { success, ai: true/false, understanding, approach }
app.post('/api/ai/understand', aiGuard, async (req, res) => {
  const text = (req.body && req.body.text || '').trim();
  if (!text) return res.status(400).json({ success: false, error: '请输入场景描述' });
  if (!AI_CONFIG.enabled) return res.json({ success: false, ai: false, error: 'AI 未启用' });
  const result = await aiUnderstand(text);
  if (!result) return res.json({ success: false, ai: false, error: 'AI 调用失败' });
  res.json({ success: true, ai: true, data: result });
});

// ========== API: AI 状态探测 ==========
// GET /api/ai/status  返回 AI 是否启用，供前端探测
app.get('/api/ai/status', (req, res) => {
  res.json({ success: true, enabled: AI_CONFIG.enabled, model: AI_CONFIG.enabled ? AI_CONFIG.model : null });
});

// ========== START ==========
app.listen(PORT, () => {
  console.log('慢慢说服务端已启动: http://localhost:' + PORT);
  console.log('数据目录: ' + DATA_DIR);
  console.log('AI (LongCat-2.0): ' + (AI_CONFIG.enabled ? '已启用' : '未启用（设置 LONGCAT_API_KEY 环境变量开启）'));
  initDemoRoom();
});