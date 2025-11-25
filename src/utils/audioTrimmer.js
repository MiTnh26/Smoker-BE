const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set ffmpeg path
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

/**
 * Cắt audio từ buffer
 * @param {Buffer} audioBuffer - Buffer của file audio gốc
 * @param {number} startOffset - Thời điểm bắt đầu (giây)
 * @param {number} duration - Độ dài đoạn cần cắt (giây)
 * @returns {Promise<Buffer>} - Buffer của file audio đã cắt
 */
async function trimAudio(audioBuffer, startOffset = 0, duration = null, originalExtension = '.mp3') {
  return new Promise((resolve, reject) => {
    // Tạo temp file cho input (giữ extension gốc)
    const inputExt = originalExtension || '.mp3';
    const tempInputPath = path.join(os.tmpdir(), `input_${Date.now()}_${Math.random().toString(36).substring(7)}${inputExt}`);
    const tempOutputPath = path.join(os.tmpdir(), `output_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);

    // Ghi buffer vào temp file
    fs.writeFileSync(tempInputPath, audioBuffer);

    // Tạo ffmpeg command
    let command = ffmpeg(tempInputPath)
      .audioCodec('libmp3lame') // Encode lại để đảm bảo tương thích
      .audioBitrate(128) // Bitrate 128kbps để giảm dung lượng
      .on('start', (commandLine) => {
        console.log('[AUDIO TRIMMER] FFmpeg command:', commandLine);
      })
      .on('error', (err) => {
        console.error('[AUDIO TRIMMER] Error:', err);
        // Cleanup
        try {
          if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
          if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
        } catch (e) {}
        reject(err);
      })
      .on('end', () => {
        try {
          // Đọc file output
          const trimmedBuffer = fs.readFileSync(tempOutputPath);
          
          // Cleanup temp files
          if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
          if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
          
          resolve(trimmedBuffer);
        } catch (err) {
          // Cleanup
          try {
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
          } catch (e) {}
          reject(err);
        }
      });

    // Áp dụng trimming
    if (startOffset > 0) {
      command = command.seekInput(startOffset);
    }
    
    if (duration) {
      command = command.duration(duration);
    }

    // Output file - luôn dùng mp3 để đảm bảo tương thích
    command.format('mp3').save(tempOutputPath);
  });
}

module.exports = {
  trimAudio
};

