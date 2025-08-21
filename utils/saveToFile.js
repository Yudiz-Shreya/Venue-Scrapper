const fs = require('fs');
const path = require('path');

function isValidData(data) {
  return Object.values(data).some(value => {
    if (typeof value === 'string') return value.trim() !== '';
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
    return Boolean(value);
  });
}

module.exports = function saveToFile(fileName, data) {
  const outputDir = path.join(__dirname, '../output');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return;
  }

  const filePath = path.join(outputDir, `${fileName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  // Data saved successfully
};
