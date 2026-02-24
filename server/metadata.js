const { exec } = require('child_process');
const path = require('path');

function getMediaMetadata(filePath) {
  return new Promise((resolve) => {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        resolve(null);
        return;
      }
      
      try {
        const data = JSON.parse(stdout);
        const result = {
          width: null,
          height: null,
          duration: null,
          fps: null,
          bitrate: null,
          codec: null
        };
        
        const videoStream = data.streams?.find(s => s.codec_type === 'video');
        const audioStream = data.streams?.find(s => s.codec_type === 'audio');
        const format = data.format || {};
        
        if (videoStream) {
          result.width = videoStream.width || null;
          result.height = videoStream.height || null;
          result.codec = videoStream.codec_name || null;
          
          if (videoStream.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split('/');
            result.fps = den ? parseFloat(num) / parseFloat(den) : parseFloat(num);
          }
          
          if (videoStream.duration) {
            result.duration = parseFloat(videoStream.duration);
          }
        } else if (audioStream) {
          result.codec = audioStream.codec_name || null;
          if (audioStream.duration) {
            result.duration = parseFloat(audioStream.duration);
          }
        }
        
        if (format.duration && !result.duration) {
          result.duration = parseFloat(format.duration);
        }
        
        if (format.bit_rate) {
          result.bitrate = parseInt(format.bit_rate);
        }
        
        resolve(result);
      } catch (parseErr) {
        resolve(null);
      }
    });
  });
}

module.exports = { getMediaMetadata };
