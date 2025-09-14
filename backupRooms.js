const fs = require('fs');
const path = require('path');

// rooms.json 데이터를 백업하는 함수
async function backupRooms(data) {
  try {
    const backupDir = path.join(__dirname, 'backups');

    // ✅ backups 폴더 없으면 자동 생성
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    const filePath = path.join(backupDir, `rooms_${Date.now()}.json`);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log('✅ rooms.json 백업 완료:', filePath);
  } catch (err) {
    console.error('❌ rooms.json 백업 실패:', err);
  }
}

module.exports = backupRooms;