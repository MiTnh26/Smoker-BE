// Test upload endpoint
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function testUpload() {
  try {
    const form = new FormData();
    
    // Tạo file test nhỏ
    const testContent = 'Test image content';
    form.append('images', Buffer.from(testContent), {
      filename: 'test.txt',
      contentType: 'text/plain'
    });
    
    const response = await axios.post('http://localhost:9999/api/posts/upload', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': 'Bearer YOUR_TOKEN_HERE' // Cần token thật
      }
    });
    
    console.log('Upload success:', response.data);
  } catch (error) {
    console.error('Upload failed:', error.response?.data || error.message);
  }
}

testUpload();
