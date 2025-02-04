const express = require("express");
const axios = require("axios");
require("dotenv").config();

const router = express.Router();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Function to extract video ID from URL
const extractVideoId = (url) => {
  const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
};

// API to fetch full YouTube video details
router.post("/getVideoDetails", async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ message: "Video URL is required" });
    }

    // Extract Video ID
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return res.status(400).json({ message: "Invalid YouTube URL" });
    }

    // Fetch video details
    const videoApiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,liveStreamingDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const videoResponse = await axios.get(videoApiUrl);
    const videoData = videoResponse.data.items[0];

    if (!videoData) {
      return res.status(404).json({ message: "Video not found" });
    }

    // Extract required details
    const { title, description, tags, thumbnails, liveBroadcastContent } = videoData.snippet;
    const { viewCount, likeCount, dislikeCount, commentCount } = videoData.statistics || {};
    const liveWatching = videoData.liveStreamingDetails?.concurrentViewers || "N/A";

    // Fetch top 5 most liked comments
    const commentsApiUrl = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=5&order=relevance&key=${YOUTUBE_API_KEY}`;
    const commentsResponse = await axios.get(commentsApiUrl);
    const comments = commentsResponse.data.items.map((comment) => {
      return {
        author: comment.snippet.topLevelComment.snippet.authorDisplayName,
        text: comment.snippet.topLevelComment.snippet.textDisplay,
        likeCount: comment.snippet.topLevelComment.snippet.likeCount,
      };
    });

    // Extract keywords from description and tags
    const keywords = description
      ? description.match(/\b\w+\b/g).slice(0, 10)
      : tags || [];
    let data = [{videoId,
      title,
      description,
      tags: tags || [],
      keywords,
      thumbnails: {
        default: thumbnails.default.url,
        medium: thumbnails.medium.url,
        high: thumbnails.high.url,
      },
      statistics: {
        views: viewCount || "N/A",
        likes: likeCount || "N/A",
        dislikes: dislikeCount || "N/A",
        comments: commentCount || "N/A",
      },
      liveWatching,
      comments}]

    return res.status(200).json({
      message: "Video details fetched successfully",
      data
    });
  } catch (error) {
    console.error("Error fetching video details:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});



// API to fetch top 10 viral videos for a given keyword and region
router.post("/getCompetitorVideos", async (req, res) => {
  try {
    const { searchQuery, regionCode } = req.body;

    if (!searchQuery) {
      return res.status(400).json({ message: "Search query is required" });
    }

    if (!regionCode) {
      return res.status(400).json({ message: "Region code is required (Example: 'US', 'IN', 'GB')." });
    }

    // Search for top 10 viral videos based on region
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(
      searchQuery
    )}&order=viewCount&type=video&regionCode=${regionCode}&key=${YOUTUBE_API_KEY}`;

    const searchResponse = await axios.get(searchUrl);
    const searchResults = searchResponse.data.items;

    if (!searchResults || searchResults.length === 0) {
      return res.status(404).json({ message: "No videos found for the specified region." });
    }

    // Fetch detailed video stats for each video
    const videoIds = searchResults.map((video) => video.id.videoId).join(",");
    const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
    const videoDetailsResponse = await axios.get(videoDetailsUrl);
    const videoDetails = videoDetailsResponse.data.items;

    // Format the response
    const videos = videoDetails.map((video) => {
      const { title, tags, thumbnails } = video.snippet;
      const { viewCount, likeCount, commentCount } = video.statistics || {};

      // Extract keywords from title (First 10 words)
      const keywords = title.match(/\b\w+\b/g)?.slice(0, 10) || [];

      return {
        videoId: video.id,
        title,
        thumbnails: {
          default: thumbnails.default.url,
          medium: thumbnails.medium.url,
          high: thumbnails.high.url,
        },
        keywords,
        // tags: tags || [],
        // statistics: {
        //   views: viewCount || "N/A",
        //   likes: likeCount || "N/A",
        //   comments: commentCount || "N/A",
        // },
      };
    });

    return res.status(200).json({
      message: `Top 10 videos for "${searchQuery}" in region "${regionCode}"`,
      videos,
    });
  } catch (error) {
    console.error("Error fetching competitor videos:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});





const extractChannelId = async (channelUrl) => {
  if (!channelUrl.includes("channel/") && !channelUrl.includes("user/")) {
    return null;
  }

  if (channelUrl.includes("channel/")) {
    return channelUrl.split("channel/")[1].split("?")[0];
  }

  // If URL contains "user/", resolve to Channel ID
  const username = channelUrl.split("user/")[1].split("?")[0];
  const response = await axios.get(
    `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${username}&key=${YOUTUBE_API_KEY}`
  );
  return response.data.items.length ? response.data.items[0].id : null;
};

// API to fetch YouTube Channel Full Data
router.post("/getChannelFullData", async (req, res) => {
  try {
    const { channelUrl } = req.body;

    if (!channelUrl) {
      return res.status(400).json({ message: "Channel URL is required" });
    }

    // Extract Channel ID
    const channelId = await extractChannelId(channelUrl);
    if (!channelId) {
      return res.status(400).json({ message: "Invalid YouTube Channel URL" });
    }

    // Fetch Channel Details
    const channelApiUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${YOUTUBE_API_KEY}`;
    const channelResponse = await axios.get(channelApiUrl);
    const channelData = channelResponse.data.items[0];

    if (!channelData) {
      return res.status(404).json({ message: "Channel not found" });
    }

    const { title, description, thumbnails, customUrl, publishedAt } = channelData.snippet;
    const { subscriberCount, viewCount, videoCount } = channelData.statistics;
    const bannerUrl = channelData.brandingSettings?.image?.bannerExternalUrl || null;
    const keywords = channelData.brandingSettings?.channel?.keywords || "No Keywords";

    // Estimate Earnings (Based on CPM Range: $0.25 - $4 per 1000 views)
    const minEarnings = ((viewCount / 1000) * 0.25).toFixed(2);
    const maxEarnings = ((viewCount / 1000) * 4).toFixed(2);

    // Fetch Top 50 Videos
    const videosApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&maxResults=50&order=viewCount&type=video&key=${YOUTUBE_API_KEY}`;
    const videosResponse = await axios.get(videosApiUrl);
    const videos = videosResponse.data.items.map((video) => ({
      videoId: video.id.videoId,
      title: video.snippet.title,
      thumbnails: video.snippet.thumbnails,
      publishedAt: video.snippet.publishedAt,
    }));

    // Fetch All Playlists
    const playlistApiUrl = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&channelId=${channelId}&maxResults=20&key=${YOUTUBE_API_KEY}`;
    const playlistResponse = await axios.get(playlistApiUrl);
    const playlists = playlistResponse.data.items.map((playlist) => ({
      id: playlist.id,
      title: playlist.snippet.title,
      thumbnail: playlist.snippet.thumbnails.medium.url,
    }));

    // Fetch Videos for Each Playlist
    const playlistsWithVideos = await Promise.all(
      playlists.map(async (playlist) => {
        const playlistItemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlist.id}&maxResults=10&key=${YOUTUBE_API_KEY}`;
        const playlistItemsResponse = await axios.get(playlistItemsUrl);
        const videos = playlistItemsResponse.data.items.map((item) => ({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          thumbnails: item.snippet.thumbnails,
        }));
        return { ...playlist, videos };
      })
    );

    return res.status(200).json({
      message: "YouTube Channel Full Data Fetched Successfully",
      channel: {
        id: channelId,
        title,
        description,
        customUrl,
        publishedAt,
        keywords,
        thumbnails,
        bannerUrl,
        statistics: {
          subscribers: subscriberCount,
          views: viewCount,
          videos: videoCount,
          estimatedEarnings: {
            min: `$${minEarnings}`,
            max: `$${maxEarnings}`,
          },
        },
      },
      topVideos: videos,
      playlists: playlistsWithVideos,
    });
  } catch (error) {
    console.error("Error fetching YouTube channel full data:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});





// Function to fetch **REAL YOUTUBE SEARCH SUGGESTIONS** based on keywords
const fetchYouTubeSuggestions = async (keyword) => {
  try {
    const response = await axios.get(
      `http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(keyword)}`
    );
    return response.data[1] || []; // Returns suggested search terms
  } catch (error) {
    console.error("Error fetching YouTube suggestions:", error);
    return [];
  }
};

// Function to generate relevant YouTube tags
const generateTags = async (keywords) => {
  let allTags = new Set();

  for (let keyword of keywords) {
    const suggestions = await fetchYouTubeSuggestions(keyword);
    suggestions.forEach((term) => allTags.add(term.toLowerCase()));
  }

  // **Filter out irrelevant words** (Ensure only YouTube video-related words remain)
  const gamingKeywords = ["gaming", "video", "game", "console", "pc", "ps5", "xbox", "funny", "esports", "streaming", "clips", "highlights", "trending"];
  let relevantTags = [...allTags].filter((tag) =>
    gamingKeywords.some((word) => tag.includes(word))
  );

  // **Deduplicate & limit to top 20 tags**
  return [...new Set(relevantTags)].slice(0, 20);
};

// API Endpoint to Generate Tags Based on User Keywords
router.post("/generateTags", async (req, res) => {
  try {
    const { keywords } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ message: "Please provide an array of keywords" });
    }

    const generatedTags = await generateTags(keywords);

    return res.status(200).json({
      message: "Tags generated successfully",
      keywords,
      generatedTags,
    });
  } catch (error) {
    console.error("Error generating tags:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Function to generate YouTube tags using Google Gemini 1.5 Flash API

const cleanAIResponse = (text) => {
  // Remove Markdown code block syntax if present
  text = text.replace(/```json|```/g, "").trim();

  // Attempt to parse JSON safely
  try {
    return JSON.parse(text);
  } catch (error) {
    // If parsing fails, fallback to splitting by new lines
    return text.split("\n").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
};

// Function to generate YouTube tags using Google Gemini 1.5 Pro API
const generateTagsAndKeywords = async (keywords) => {
  try {
    // Create a proper prompt for Gemini AI
    const promptText = `
      You are an expert in YouTube SEO. Based on these keywords: ${keywords.join(", ")}.
      Generate the top 10 most trending and relevant YouTube video tags.
      Ensure they are optimized for YouTube search and video discovery.
      Return the tags in JSON format as an array, without any extra text.
    `;

    // Correct JSON format for Gemini API request
    const requestData = {
      contents: [{ parts: [{ text: promptText }] }]
    };

    // Make request to Gemini 1.5 Pro API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${GEMINI_API_KEY}`,
      requestData,
      { headers: { "Content-Type": "application/json" } }
    );

    // Extract AI response
    const aiResponse = response.data.candidates[0].content.parts[0].text.trim();
    console.log("Raw AI Response:", aiResponse); // Debugging

    // Clean & Parse AI response
    const generatedTags = cleanAIResponse(aiResponse);

    // Ensure only top 10 tags
    return generatedTags.slice(0, 10);
  } catch (error) {
    console.error("Error fetching AI-generated tags:", error.response?.data || error.message);
    return [];
  }
};

// API Endpoint to Generate Tags Using Gemini AI
router.post("/generateAITags", async (req, res) => {
  try {
    const { keywords } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ message: "Please provide an array of keywords" });
    }

    const generatedTags = await generateTagsAndKeywords(keywords);

    return res.status(200).json({
      message: "AI-generated tags and keywords",
      keywords,
      generatedTags,
    });
  } catch (error) {
    console.error("Error generating AI tags:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


// Function to clean AI response and extract valid titles
const cleanAIResponseTitle = (text) => {
  // Remove Markdown code block syntax if present
  text = text.replace(/```json|```/g, "").trim();

  // Attempt to parse JSON safely
  try {
    return JSON.parse(text);
  } catch (error) {
    // If parsing fails, fallback to splitting by new lines
    return text.split("\n").map((title) => title.trim()).filter((title) => title.length > 0);
  }
};

// Function to generate viral video titles with emojis using Google Gemini AI
const generateViralTitles = async (keywords) => {
  try {
    // Create a prompt for Gemini AI
    const promptText = `
      You are an expert in YouTube video marketing. 
      Based on the following keywords: ${keywords.join(", ")}, generate 3 highly engaging viral video titles.
      Each title must:
      - Be **highly clickable** and optimized for YouTube SEO.
      - Use relevant **emojis** to attract viewers.
      - Be no longer than 60 characters.

      Return only the **3 viral video titles** as a JSON array.
    `;

    // Correct JSON format for Gemini API request
    const requestData = {
      contents: [{ parts: [{ text: promptText }] }]
    };

    // Make request to Gemini 1.5 Pro API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${GEMINI_API_KEY}`,
      requestData,
      { headers: { "Content-Type": "application/json" } }
    );

    // Extract AI response
    const aiResponse = response.data.candidates[0].content.parts[0].text.trim();
    console.log("Raw AI Response:", aiResponse); // Debugging

    // Clean & Parse AI response
    const viralTitles = cleanAIResponseTitle(aiResponse);

    // Ensure only top 3 titles
    return viralTitles.slice(0, 3);
  } catch (error) {
    console.error("Error fetching AI-generated titles:", error.response?.data || error.message);
    return [];
  }
};

// API Endpoint to Generate Viral Titles Using Gemini AI
router.post("/generateViralTitles", async (req, res) => {
  try {
    const { keywords } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ message: "Please provide an array of keywords" });
    }

    const viralTitles = await generateViralTitles(keywords);

    return res.status(200).json({
      message: "AI-generated viral video titles",
      keywords,
      viralTitles,
    });
  } catch (error) {
    console.error("Error generating AI titles:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Function to clean AI response and extract valid descriptions
const cleanAIResponseDescription = (text) => {
  // Remove Markdown code block syntax if present
  text = text.replace(/```json|```/g, "").trim();
  return text;
};

// Function to generate optimized YouTube video descriptions with emojis using Google Gemini AI
const generateVideoDescription = async (videoDetails) => {
  try {
    // Create a prompt for Gemini AI
    const promptText = `
      You are an expert in YouTube content creation.
      Based on the following short video details: "${videoDetails}",
      generate a **highly engaging and SEO-optimized YouTube video description**.
      Ensure that the description includes:
      - **Exciting text with emojis** for engagement.
      - **Call to action (e.g., Like, Comment, Subscribe)**.
      - **Relevant hashtags**.
      - **Key moments of the video** in short format.

      Return the description in a properly formatted **text format**, not JSON.
    `;

    // Correct JSON format for Gemini API request
    const requestData = {
      contents: [{ parts: [{ text: promptText }] }]
    };

    // Make request to Gemini 1.5 Pro API
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${GEMINI_API_KEY}`,
      requestData,
      { headers: { "Content-Type": "application/json" } }
    );

    // Extract AI response
    const aiResponse = response.data.candidates[0].content.parts[0].text.trim();
    // console.log("Raw AI Response:", aiResponse); // Debugging

    // Clean AI response
    const description = cleanAIResponseDescription(aiResponse);

    return description;
  } catch (error) {
    console.error("Error fetching AI-generated description:", error.response?.data || error.message);
    return "Error generating video description.";
  }
};

// API Endpoint to Generate Optimized Video Descriptions Using Gemini AI
router.post("/generateVideoDescription", async (req, res) => {
  try {
    const { videoDetails } = req.body;

    if (!videoDetails || typeof videoDetails !== "string" || videoDetails.length === 0) {
      return res.status(400).json({ message: "Please provide short details about the video." });
    }

    const generatedDescription = await generateVideoDescription(videoDetails);

    return res.status(200).json({
      message: "AI-generated video description",
      videoDetails,
      generatedDescription,
    });
  } catch (error) {
    console.error("Error generating AI video description:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});



module.exports = router;
