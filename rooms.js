// rooms.js
const fs = require('fs');
const path = require('path');

const DATA_DIR   = process.env.ROOMS_DIR || '/data';   // Railway 볼륨 경로
const ROOMS_PATH = path.join(DATA_DIR, 'rooms.json');

let roomState = new Map();

const replacer = (_, v) => (v instanceof Set ? { __set: true, v: [...v] } : v);
const reviver  = (_, v) => (v && v.__set ? new Set(v.v) : v);

function ensureDir() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

function saveRooms() {
  try {
    ensureDir();
    const json = JSON.stringify([...roomState], replacer, 2);
    fs.writeFileSync(ROOMS_PATH + '.tmp', json);
    fs.renameSync(ROOMS_PATH + '.tmp', ROOMS_PATH);
  } catch (e) {
    console.error('rooms 저장 실패:', e);
  }
}

function loadRooms() {
  try {
    ensureDir();
    if (!fs.existsSync(ROOMS_PATH)) {
      console.warn('⚠️ rooms.json이 없음. 새 상태로 시작합니다.');
      roomState = new Map();
      return;
    }
    const raw = fs.readFileSync(ROOMS_PATH, 'utf8');
    const arr = JSON.parse(raw, reviver);
    roomState = new Map(arr);
    console.log(`✅ roomState 복원 완료: ${roomState.size}개 (경로: ${ROOMS_PATH})`);
  } catch (e) {
    console.error('rooms 복원 실패:', e);
    roomState = new Map();
  }
}

module.exports = { roomState, saveRooms, loadRooms, ROOMS_PATH };
