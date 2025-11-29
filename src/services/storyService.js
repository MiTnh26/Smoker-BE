const Post = require("../models/postModel");
const PostService = require("./postService");
const FollowModel = require("../models/followModel");
const storyViewService = require("./storyViewService");
// const mongoose = require("mongoose");
class StoryService {
    async getStories(page = 1, limit = 10, userEntityAccountId = null, excludeViewed = false) {
        try {
            const skip = (page - 1) * limit;
            const now = new Date();
            
            // Nếu có userEntityAccountId, lấy danh sách những người có thể xem story:
            // 1. Những người mà user đang follow (following) - để xem story của họ
            // 2. Chính user - để xem story của mình
            // KHÔNG bao gồm followers - chỉ những người đã follow mới xem được story của mình
            // Tất cả roles (customer, bar, dj, dancer) đều áp dụng logic filter giống nhau
            let allowedEntityAccountIds = [];
            let userEntityAccountIdLower = null;
            let followingIds = []; // Khai báo ở ngoài để dùng trong logging
            if (userEntityAccountId) {
                try {
                    userEntityAccountIdLower = String(userEntityAccountId).trim().toLowerCase();
                    console.log(`[StoryService] User entityAccountId (normalized): ${userEntityAccountIdLower}`);
                    
                    // Lấy danh sách những người mà user đang follow
                    const following = await FollowModel.getFollowing(userEntityAccountId);
                    followingIds = following.map(f => String(f.FollowingId).trim().toLowerCase());
                    console.log(`[StoryService] Following ${followingIds.length} users:`, followingIds.slice(0, 3));
                    
                    // Chỉ bao gồm: following + chính user (KHÔNG bao gồm followers)
                    allowedEntityAccountIds = [
                        ...new Set([
                            ...followingIds,
                            userEntityAccountIdLower
                        ])
                    ];
                    
                    console.log(`[StoryService] User ${userEntityAccountIdLower} can see stories from: ${allowedEntityAccountIds.length} entities (${followingIds.length} following + self)`);
                    console.log(`[StoryService] Allowed entityAccountIds (normalized, first 5):`, allowedEntityAccountIds.slice(0, 5));
                } catch (err) {
                    console.warn('[StoryService] Error getting follow lists:', err.message);
                    // Nếu lỗi, vẫn cho phép xem story của chính mình
                    userEntityAccountIdLower = String(userEntityAccountId).trim().toLowerCase();
                    allowedEntityAccountIds = [userEntityAccountIdLower];
                    followingIds = [];
                }
            }
            
            // Build query: chỉ lấy story của những người đã follow (hoặc tất cả nếu chưa đăng nhập)
            const query = {
                type: "story",
                expiredAt: { $gt: now }
            };
            
            // Lấy tất cả stories trước, sau đó filter theo follow
            let stories = await Post.find(query)
                .populate({ path: "songId", select: "song title artistName" })
                .populate({ path: "musicId", select: "audioUrl title artist coverUrl" })
                .populate({ path: "mediaIds", select: "url caption" })
                .sort({ createdAt: -1 })
                .lean();
            
            console.log(`[StoryService] Found ${stories.length} total stories (before filter)`);
            if (stories.length > 0) {
                console.log(`[StoryService] First story entityAccountId:`, String(stories[0].entityAccountId || 'null').trim().toLowerCase());
                console.log(`[StoryService] First story accountId:`, String(stories[0].accountId || 'null'));
            }
            
            // Filter stories theo danh sách allowed (case-insensitive)
            if (allowedEntityAccountIds.length > 0) {
                console.log(`[StoryService] Filtering ${stories.length} stories with ${allowedEntityAccountIds.length} allowed entities`);
                console.log(`[StoryService] Allowed entityAccountIds (normalized):`, allowedEntityAccountIds);
                console.log(`[StoryService] User entityAccountId (normalized):`, userEntityAccountIdLower);
                const beforeFilter = stories.length;
                const filteredStories = [];
                const rejectedStories = [];
                
                stories.forEach(story => {
                    if (!story.entityAccountId) {
                        console.warn(`[StoryService] Story ${story._id} has no entityAccountId - REJECTED`);
                        rejectedStories.push({ id: story._id, reason: 'no entityAccountId' });
                        return;
                    }
                    const storyEntityAccountId = String(story.entityAccountId).trim().toLowerCase();
                    const isAllowed = allowedEntityAccountIds.includes(storyEntityAccountId);
                    
                    // Debug: Log chi tiết cho story mới tạo (trong vòng 5 phút)
                    const storyAge = now - new Date(story.createdAt);
                    const isRecentStory = storyAge < 5 * 60 * 1000; // 5 phút
                    if (isRecentStory) {
                        console.log(`[StoryService] 🔍 Recent story ${story._id}:`, {
                            storyEntityAccountId,
                            userEntityAccountIdLower,
                            isOwn: storyEntityAccountId === userEntityAccountIdLower,
                            isInFollowing: followingIds.includes(storyEntityAccountId),
                            isAllowed,
                            createdAt: story.createdAt,
                            ageMinutes: Math.round(storyAge / 1000 / 60)
                        });
                    }
                    
                    if (isAllowed) {
                        console.log(`[StoryService] ✓ Story ${story._id} from ${storyEntityAccountId} is ALLOWED (in following list or own story)`);
                        filteredStories.push(story);
                    } else {
                        console.log(`[StoryService] ✗ Story ${story._id} from ${storyEntityAccountId} is REJECTED (not in following list)`);
                        rejectedStories.push({ id: story._id, entityAccountId: storyEntityAccountId, reason: 'not in allowed list' });
                    }
                });
                
                stories = filteredStories;
                console.log(`[StoryService] Filtered ${beforeFilter} stories to ${stories.length} stories`);
                console.log(`[StoryService] Rejected ${rejectedStories.length} stories:`, rejectedStories.slice(0, 5));
            } else if (userEntityAccountIdLower) {
                // Nếu đã đăng nhập nhưng không follow ai và không có ai follow, chỉ hiển thị story của chính mình
                console.log(`[StoryService] No follow relationships, showing only own stories for ${userEntityAccountIdLower}`);
                stories = stories.filter(story => {
                    if (!story.entityAccountId) {
                        // Fallback: check accountId nếu không có entityAccountId
                        if (story.accountId) {
                            // Không thể match vì không có accountId của user ở đây
                            return false;
                        }
                        return false;
                    }
                    const storyEntityAccountId = String(story.entityAccountId).trim().toLowerCase();
                    const isOwn = storyEntityAccountId === userEntityAccountIdLower;
                    
                    if (isOwn) {
                        console.log(`[StoryService] ✓ Found own story ${story._id}`);
                    }
                    return isOwn;
                });
                console.log(`[StoryService] Found ${stories.length} own stories`);
            } else {
                // Nếu chưa đăng nhập, không hiển thị story nào
                console.log(`[StoryService] No userEntityAccountId, returning empty array`);
                stories = [];
            }
            
            // Tính total trước khi pagination
            let total = stories.length;
            
            // Apply pagination sau khi filter
            stories = stories.slice(skip, skip + limit);


                   // Filter out viewed stories nếu excludeViewed = true
                   if (excludeViewed && userEntityAccountIdLower) {
                       try {
                           const viewedStoryIds = await storyViewService.getViewedStoryIds(userEntityAccountIdLower);
                           if (viewedStoryIds && viewedStoryIds.length > 0) {
                               const viewedStoryIdsLower = viewedStoryIds.map(id => String(id).trim().toLowerCase());
                               const beforeFilter = stories.length;
                               stories = stories.filter(story => {
                                   const storyId = story._id ? String(story._id).trim().toLowerCase() : null;
                                   return !storyId || !viewedStoryIdsLower.includes(storyId);
                               });
                               console.log(`[StoryService] Filtered ${beforeFilter} stories to ${stories.length} stories (excluded ${beforeFilter - stories.length} viewed stories)`);
                               // Update total after filtering
                               total = stories.length;
                           }
                       } catch (err) {
                           console.warn('[StoryService] Error filtering viewed stories:', err.message);
                           // Nếu lỗi, vẫn trả về tất cả stories
                       }
                   }

                   // Đưa songFilename và audioUrl ra ngoài cho tiện FE dùng
                   // Story chỉ dùng songId (chọn từ danh sách), không dùng musicId
                   let storiesWithSong = stories.map(story => {
                       const songFilename = story.songId && story.songId.song ? story.songId.song : null;
                       const songTitle = story.songId && story.songId.title ? story.songId.title : null;
                       const songArtist = story.songId && story.songId.artistName ? story.songId.artistName : null;
                       // Story chỉ dùng songId, không có musicId
                       const audioUrl = songFilename ? `http://localhost:9999/api/song/stream/${songFilename}` : null;
                       
                       return {
                       ...story,
                           songFilename: songFilename,
                           songName: songTitle, // Tên bài hát
                           songArtist: songArtist, // Tên nghệ sĩ
                           audioUrl: audioUrl,
                           // Giữ lại audioDuration và audioStartOffset từ post để frontend sử dụng (nếu có)
                           audioDuration: story.audioDuration,
                           audioStartOffset: story.audioStartOffset
                       };
                   });

                   // Enrich với thông tin author (authorName, avatar)
                   await PostService.enrichPostsWithAuthorInfo(storiesWithSong);

                   // Thêm field viewed: true/false cho mỗi story
                   // Backend cần trả về field này để frontend có thể filter stories đã xem
                   if (userEntityAccountIdLower && storiesWithSong.length > 0) {
                       try {
                           const viewedStoryIds = await storyViewService.getViewedStoryIds(userEntityAccountIdLower);
                           const viewedStoryIdsLower = viewedStoryIds.map(id => String(id).trim().toLowerCase());
                           
                           console.log(`[StoryService] Checking viewed status for ${storiesWithSong.length} stories, user: ${userEntityAccountIdLower}, viewedStoryIds:`, viewedStoryIdsLower);
                           
                           storiesWithSong = storiesWithSong.map(story => {
                               const storyId = story._id ? String(story._id).trim().toLowerCase() : null;
                               const viewed = storyId && viewedStoryIdsLower.includes(storyId);
                               if (viewed) {
                                   console.log(`[StoryService] Story ${storyId} is marked as viewed`);
                               }
                               return {
                                   ...story,
                                   viewed: viewed || false  // Thêm field viewed: true/false
                               };
                           });
                           
                           const viewedCount = storiesWithSong.filter(s => s.viewed === true).length;
                           console.log(`[StoryService] Added viewed field to ${storiesWithSong.length} stories (${viewedStoryIds.length} viewed stories found, ${viewedCount} marked as viewed in response)`);
                       } catch (err) {
                           console.warn('[StoryService] Error adding viewed field to stories:', err.message);
                           // Nếu lỗi, vẫn trả về stories nhưng với viewed: false
                           storiesWithSong = storiesWithSong.map(story => ({
                               ...story,
                               viewed: false
                           }));
                       }
                   } else {
                       // Nếu không có userEntityAccountId, tất cả stories đều viewed: false
                       storiesWithSong = storiesWithSong.map(story => ({
                           ...story,
                           viewed: false
                       }));
                   }

                   return {
                       success: true,
                       data: storiesWithSong,
                       pagination: {
                           page,
                           limit,
                           total,
                           pages: Math.ceil(total / limit)
                       }
                   };
        } catch (error) {
            return {
                success: false,
                message: "Error fetching stories",
                error: error.message
            };
        }
    }
}

module.exports = new StoryService();