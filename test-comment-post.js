const axios = require('axios');

// Cấu hình
const BASE_URL = 'http://localhost:9999';
const API_URL = `${BASE_URL}/api`;

// Test user credentials
const testUser = {
  email: "minhtn2004@gmail.com",
  password: "Minhtran26@"
};

async function testAddComment() {
  try {
    console.log('🧪 Testing Add Comment API...\n');

    // Bước 1: Đăng nhập để lấy token
    console.log('1️⃣ Logging in to get authentication token...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, testUser);
    
    if (!loginResponse.data.token) {
      throw new Error('Login failed: ' + loginResponse.data.message);
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, token received\n');

    // Bước 2: Lấy một post để test comment
    console.log('2️⃣ Getting a post to test comment...');
    const getAllPostsResponse = await axios.get(`${API_URL}/posts`);
    
    if (!getAllPostsResponse.data.success || getAllPostsResponse.data.data.length === 0) {
      throw new Error('No posts found to test with');
    }

    const testPost = getAllPostsResponse.data.data[0];
    const postId = testPost._id;
    console.log('✅ Post found for testing');
    console.log('📄 Post ID:', postId);
    console.log('📄 Post title:', testPost['Tiêu Đề'] || testPost.title);

    // Bước 3: Thêm comment
    console.log('\n3️⃣ Adding comment to the post...');
    const commentData = {
      content: "This is a test comment for the post!",
      images: "test-comment-image.jpg",
      typeRole: "Account"
    };

    const addCommentResponse = await axios.post(`${API_URL}/posts/${postId}/comments`, commentData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (addCommentResponse.data.success) {
      console.log('✅ Comment added successfully!');
      console.log('📄 Response:', JSON.stringify(addCommentResponse.data, null, 2));
      
      // Lấy comment ID từ comments map (comment mới nhất)
      const comments = addCommentResponse.data.data.comments;
      const commentKeys = Object.keys(comments);
      const latestCommentId = commentKeys[commentKeys.length - 1];
      
      console.log('📄 Latest comment ID:', latestCommentId);
      return { postId, commentId: latestCommentId };
    } else {
      console.log('❌ Failed to add comment:', addCommentResponse.data.message);
      return null;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.response) {
      console.error('📄 Error response:', JSON.stringify(error.response.data, null, 2));
      console.error('📄 Status code:', error.response.status);
    }
    return null;
  }
}

async function testAddReply(postId, commentId) {
  try {
    console.log('\n🧪 Testing Add Reply API...');

    // Đăng nhập
    const loginResponse = await axios.post(`${API_URL}/auth/login`, testUser);
    const token = loginResponse.data.token;

    // Bước 1: Thêm reply
    console.log('1️⃣ Adding reply to comment...');
    const replyData = {
      content: "This is a test reply to the comment!",
      images: "test-reply-image.jpg",
      typeRole: "Account"
    };

    const addReplyResponse = await axios.post(`${API_URL}/posts/${postId}/comments/${commentId}/replies`, replyData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (addReplyResponse.data.success) {
      console.log('✅ Reply added successfully!');
      console.log('📄 Response:', JSON.stringify(addReplyResponse.data, null, 2));
    } else {
      console.log('❌ Failed to add reply:', addReplyResponse.data.message);
    }

  } catch (error) {
    console.error('❌ Reply test failed:', error.message);
    
    if (error.response) {
      console.error('📄 Error response:', JSON.stringify(error.response.data, null, 2));
      console.error('📄 Status code:', error.response.status);
    }
  }
}

// Test comment không có authentication (sẽ fail)
async function testCommentWithoutAuth() {
  try {
    console.log('\n🧪 Testing Add Comment without authentication (should fail)...');
    
    const response = await axios.post(`${API_URL}/posts/507f1f77bcf86cd799439011/comments`, {
      content: "Test comment"
    });
    console.log('❌ Unexpected success - this should have failed!');
    
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Correctly rejected unauthorized request');
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

// Test reply không có authentication (sẽ fail)
async function testReplyWithoutAuth() {
  try {
    console.log('\n🧪 Testing Add Reply without authentication (should fail)...');
    
    const response = await axios.post(`${API_URL}/posts/507f1f77bcf86cd799439011/comments/507f1f77bcf86cd799439012/replies`, {
      content: "Test reply"
    });
    console.log('❌ Unexpected success - this should have failed!');
    
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Correctly rejected unauthorized request');
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

// Test lấy post với comments để xem kết quả
async function testGetPostWithComments(postId) {
  try {
    console.log('\n🧪 Testing Get Post with Comments...');
    
    const getPostResponse = await axios.get(`${API_URL}/posts/${postId}`);
    
    if (getPostResponse.data.success) {
      const post = getPostResponse.data.data;
      console.log('✅ Post retrieved successfully');
      console.log('📄 Post title:', post['Tiêu Đề'] || post.title);
      console.log('📄 Comments count:', Object.keys(post.comments || {}).length);
      console.log('📄 Comments:', JSON.stringify(post.comments, null, 2));
    } else {
      console.log('❌ Failed to get post:', getPostResponse.data.message);
    }
    
  } catch (error) {
    console.error('❌ Get post test failed:', error.message);
  }
}

// Chạy tất cả tests
async function runAllTests() {
  console.log('🚀 Starting Comment & Reply API Tests\n');
  console.log('=' .repeat(60));
  
  // Test 1: Comment không có auth (sẽ fail)
  await testCommentWithoutAuth();
  
  // Test 2: Reply không có auth (sẽ fail)
  await testReplyWithoutAuth();
  
  // Test 3: Thêm comment có auth
  const commentResult = await testAddComment();
  
  // Test 4: Thêm reply nếu comment thành công
  if (commentResult) {
    await testAddReply(commentResult.postId, commentResult.commentId);
    
    // Test 5: Lấy post để xem comments
    await testGetPostWithComments(commentResult.postId);
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('🏁 All tests completed!');
}

// Chạy tests
runAllTests();
