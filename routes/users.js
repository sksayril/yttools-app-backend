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
    let data =[{videos}]
    return res.status(200).json({
      message: `Top 10 videos for "${searchQuery}" in region "${regionCode}"`,
      data
    });
  } catch (error) {
    console.error("Error fetching competitor videos:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});






const extractChannelId = async (channelUrl) => {
  if (!channelUrl.includes("channel/") && !channelUrl.includes("user/") && !channelUrl.includes("@")) {
    return null;
  }

  // Extract Channel ID from /channel/ URLs
  if (channelUrl.includes("channel/")) {
    return channelUrl.split("channel/")[1].split("?")[0];
  }

  // Extract username from /user/ URLs
  if (channelUrl.includes("user/")) {
    const username = channelUrl.split("user/")[1].split("?")[0];
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${username}&key=${YOUTUBE_API_KEY}`
    );
    return response.data.items.length ? response.data.items[0].id : null;
  }

  // Handle @username format (New YouTube Handle System)
  if (channelUrl.includes("@")) {
    const handle = channelUrl.split("youtube.com/")[1].split("?")[0];
    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${handle}&key=${YOUTUBE_API_KEY}`
    );
    return response.data.items.length ? response.data.items[0].id : null;
  }

  return null;
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
    let data = [{channel: {
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
    playlists: playlistsWithVideos,}]

    return res.status(200).json({
      message: "YouTube Channel Full Data Fetched Successfully",
      data
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
    let data = [{
      keywords,
      generatedTags
    }]
    return res.status(200).json({
      message: "Tags generated successfully",
      data
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
    let data = [{
      keywords,
      generatedTags
    }]
    return res.status(200).json({
      message: "AI-generated tags and keywords",
      data
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
    let data = [{
      keywords,
      viralTitles
    }]
    return res.status(200).json({
      message: "AI-generated viral video titles",
      data
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





const AI_API_URL = "http://103.39.135.30:11434/api/generate"; // DeepSeek API URL

// Function to clean and parse AI responses
const cleanAIResponseOllama = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    return text.split("\n").map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
};

// Function to generate YouTube tags using DeepSeek API
const generateTagsAndKeywordsOllama = async (keywords) => {
  try {
    // Construct the prompt
    const promptText = `You are an expert in YouTube SEO. Based on these keywords: ${keywords.join(", ")}.
      Generate the top 10 most trending and relevant YouTube video tags.
      Ensure they are optimized for YouTube search and video discovery.
      Return the tags in JSON format as an array, without any extra text.`;

    // Request payload for DeepSeek API (Streaming Disabled)
    const requestData = {
      model: "deepseek-r1:14b",
      prompt: promptText,
      stream: false // Disabled Streaming
    };

    // Make a synchronous API request (Full Response)
    const response = await axios.post(AI_API_URL, requestData, { headers: { "Content-Type": "application/json" } });
    console.log(response)
    // Extract AI response content
    const aiResponse = response.data?.content || "";
    console.log("Raw AI Response:", aiResponse); // Debugging

    // Clean and parse AI response
    const generatedTags = cleanAIResponseOllama(aiResponse);

    // Ensure only top 10 tags
    return generatedTags.slice(0, 10);
  } catch (error) {
    console.error("Error fetching AI-generated tags:", error.message);
    return [];
  }
};

// API Endpoint to Generate Tags Using DeepSeek AI
router.post("/ai/deepseek/generateAITags", async (req, res) => {
  try {
    const { keywords } = req.body;

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ message: "Please provide an array of keywords" });
    }

    const generatedTags = await generateTagsAndKeywordsOllama(keywords);

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



//POPULAR KEYWORDS

router.post("/getTopKeywords", async (req, res) => {
  try {
    const { searchQuery, regionCode } = req.body;

    if (!searchQuery) {
      return res.status(400).json({ message: "Search query is required" });
    }

    if (!regionCode) {
      return res.status(400).json({ message: "Region code is required (Example: 'US', 'IN', 'GB')." });
    }

    // Search for top 50 videos to gather a broader range of keywords
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(
      searchQuery
    )}&order=viewCount&type=video&regionCode=${regionCode}&key=${YOUTUBE_API_KEY}`;

    const searchResponse = await axios.get(searchUrl);
    const searchResults = searchResponse.data.items;

    if (!searchResults || searchResults.length === 0) {
      return res.status(404).json({ message: "No videos found for the specified region." });
    }

    // Fetch detailed video stats for each video
    const videoIds = searchResults.map((video) => video.id.videoId).join(",");
    const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
    const videoDetailsResponse = await axios.get(videoDetailsUrl);
    const videoDetails = videoDetailsResponse.data.items;

    let keywordCount = {};

    // Extracting keywords from video titles and tags
    videoDetails.forEach((video) => {
      const { title, tags } = video.snippet;

      // Extract keywords from title (first 10 words)
      const titleKeywords = title.match(/\b\w+\b/g)?.slice(0, 10) || [];

      // Extract keywords from tags if available
      const tagKeywords = tags || [];

      // Combine all keywords
      const allKeywords = [...titleKeywords, ...tagKeywords];

      // Count occurrences of each keyword
      allKeywords.forEach((word) => {
        const lowerCaseWord = word.toLowerCase();
        keywordCount[lowerCaseWord] = (keywordCount[lowerCaseWord] || 0) + 1;
      });
    });

    // Convert keyword count object to sorted array (descending order)
    const sortedKeywords = Object.entries(keywordCount)
      .sort((a, b) => b[1] - a[1]) // Sort by frequency
      .slice(0, 20) // Take top 20
      .map((entry) => entry[0]); // Extract keyword names
    let data = [{keywords: sortedKeywords,}]
    return res.status(200).json({
      message: `Top 20 popular keywords for "${searchQuery}" in region "${regionCode}"`,
      data
    });
  } catch (error) {
    console.error("Error fetching popular keywords:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// Define categories and subcategories
const categoryData = {
  Festival: ["Diwali", "Dussehra", "Holi", "Christmas", "Eid", "NewYear"],
  Work: ["Office", "RemoteWork", "Startups"],
  Fitness: ["Gym", "Yoga", "Running"],
  Music: ["Classical", "Pop", "Rock"],
  Photography: ["Portrait", "Nature", "Travel"],
  Gaming: ["PCGaming", "ConsoleGaming", "MobileGaming"],
  Animals: ["Dogs", "Cats", "Wildlife"],
  Travel: ["Mountains", "Beaches", "Cities"],
  SocialMedia: ["Influencer", "Memes", "Challenges"],
  Food: ["Vegan", "Desserts", "StreetFood"]
};

router.post("/getPopularHashtagsFromYouTube", async (req, res) => {
  try {
    const { category, regionCode } = req.body;

    if (!category || !categoryData[category]) {
      return res.status(400).json({ message: "Valid category is required." });
    }

    if (!regionCode) {
      return res.status(400).json({ message: "Region code is required (Example: 'US', 'IN', 'GB')." });
    }

    const subcategories = categoryData[category];
    let categoryHashtags = {};

    // Fetch hashtags for each subcategory
    for (const subcategory of subcategories) {
      const searchQuery = `${category} ${subcategory}`;
      console.log(`Fetching hashtags for: ${searchQuery}`);

      // Search YouTube for videos related to the subcategory
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(
        searchQuery
      )}&order=viewCount&type=video&regionCode=${regionCode}&key=${YOUTUBE_API_KEY}`;

      const searchResponse = await axios.get(searchUrl);
      const searchResults = searchResponse.data.items;

      if (!searchResults || searchResults.length === 0) {
        categoryHashtags[subcategory] = ["No hashtags found"];
        continue;
      }

      // Extract video IDs
      const videoIds = searchResults.map((video) => video.id.videoId).join(",");

      // Fetch video details (including tags and descriptions)
      const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
      const videoDetailsResponse = await axios.get(videoDetailsUrl);
      const videoDetails = videoDetailsResponse.data.items;

      let hashtagSet = new Set();

      // Extract hashtags from video titles, descriptions, and tags
      videoDetails.forEach((video) => {
        const { title, description, tags } = video.snippet;

        // Extract hashtags from title and description
        const titleHashtags = title.match(/#[a-zA-Z0-9_]+/g) || [];
        const descHashtags = description.match(/#[a-zA-Z0-9_]+/g) || [];
        const tagHashtags = tags || [];

        // Add hashtags to the set (remove duplicates)
        [...titleHashtags, ...descHashtags, ...tagHashtags].forEach((tag) => {
          hashtagSet.add(tag.toLowerCase());
        });
      });

      // Convert to array and limit to top 20 hashtags
      categoryHashtags[subcategory] = Array.from(hashtagSet).slice(0, 20);
    }
    let data = [{category,
      hashtags: categoryHashtags,}]
    return res.status(200).json({
      message:"Data Successfully Fetch",
      data
    });
  } catch (error) {
    console.error("Error fetching hashtags:", error);
    return res.status(500).json({ message: "Internal Server Error." });
  }
});


//Trending Videos

router.get("/getTrendingVideos", async (req, res) => {
  try {
    const { regionCode } = req.query;

    if (!regionCode) {
      return res.status(400).json({ message: "Region code is required (Example: 'US', 'IN', 'GB')." });
    }

    // Fetch top 50 trending videos in the specified region
    const trendingUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&maxResults=50&regionCode=${regionCode}&key=${YOUTUBE_API_KEY}`;

    const response = await axios.get(trendingUrl);
    const videos = response.data.items;

    if (!videos || videos.length === 0) {
      return res.status(404).json({ message: "No trending videos found for the specified region." });
    }

    // Format response data
    const trendingVideos = videos.map((video) => ({
      videoId: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      thumbnail: video.snippet.thumbnails.high.url,
      viewCount: video.statistics.viewCount || "N/A",
      likeCount: video.statistics.likeCount || "N/A",
      commentCount: video.statistics.commentCount || "N/A",
    }));

    return res.status(200).json({
      message: `Top 50 trending videos in region "${regionCode}"`,
      data: trendingVideos,
    });
  } catch (error) {
    console.error("Error fetching trending videos:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
router.get("/getVideoDetailsID", async (req, res) => {
  try {
    const { videoId } = req.query;

    if (!videoId) {
      return res.status(400).json({ message: "Video ID is required." });
    }

    // Fetch detailed video information
    const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;

    const response = await axios.get(videoDetailsUrl);
    const videoData = response.data.items;

    if (!videoData || videoData.length === 0) {
      return res.status(404).json({ message: "No video found for the given ID." });
    }

    const video = videoData[0];

    // Format the response data
    const videoDetails = {
      videoId: video.id,
      title: video.snippet.title,
      description: video.snippet.description,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      duration: video.contentDetails.duration, // ISO 8601 duration format (e.g., PT10M30S)
      thumbnails: video.snippet.thumbnails,
      viewCount: video.statistics.viewCount || "N/A",
      likeCount: video.statistics.likeCount || "N/A",
      commentCount: video.statistics.commentCount || "N/A",
    };

    return res.status(200).json({
      message: `Video details for ID: ${videoId}`,
      data: [videoDetails],
    });
  } catch (error) {
    console.error("Error fetching video details:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});


router.post("/checkVideoRank", async (req, res) => {
  try {
    const { videoUrl, keyword, regionCode } = req.body;

    if (!videoUrl || !keyword || !regionCode) {
      return res.status(400).json({ message: "Video URL, Keyword, and Region Code are required." });
    }

    // Extract videoId from the video URL
    const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
    if (!videoIdMatch || videoIdMatch.length < 2) {
      return res.status(400).json({ message: "Invalid YouTube video URL." });
    }
    const videoId = videoIdMatch[1];

    // Search YouTube for the given keyword in the specified region
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=50&q=${encodeURIComponent(keyword)}&regionCode=${regionCode}&type=video&key=${YOUTUBE_API_KEY}`;
    
    const searchResponse = await axios.get(searchUrl);
    const searchResults = searchResponse.data.items;

    if (!searchResults || searchResults.length === 0) {
      return res.status(404).json({ message: "No videos found for the given keyword in the specified region." });
    }

    // Find the ranking position of the provided video
    let rank = -1;
    searchResults.forEach((video, index) => {
      if (video.id.videoId === videoId) {
        rank = index + 1; // Rank starts from 1
      }
    });

    // Fetch video details
    const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const videoDetailsResponse = await axios.get(videoDetailsUrl);
    const videoData = videoDetailsResponse.data.items[0];

    if (!videoData) {
      return res.status(404).json({ message: "Video details not found." });
    }

    const { title, thumbnails, tags } = videoData.snippet;
    const { viewCount, likeCount, commentCount } = videoData.statistics;
    let data = [{videoId,
      rank: rank === -1 ? "Not in top 50" : rank,
      title,
      thumbnail: thumbnails.high.url,
      views: viewCount,
      likes: likeCount,
      comments: commentCount,
      // hashtags: tags ? tags.filter(tag => tag.startsWith("#")) : [],
      keywords: tags || [],}]
    return res.status(200).json({
      message: `Video rank for keyword "${keyword}" in region "${regionCode}".`,
      data
    });
  } catch (error) {
    console.error("Error checking video rank:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});
router.post("/calculateEarnings", async (req, res) => {
  try {
    let { views, cpm, monetizationRate } = req.body;

    if (!views || isNaN(views) || views < 0) {
      return res.status(400).json({ message: "Invalid views count. Must be a positive number." });
    }

    if (!cpm || isNaN(cpm) || cpm <= 0) {
      cpm = 5; // Default CPM ($5 per 1000 views)
    }

    if (!monetizationRate || isNaN(monetizationRate) || monetizationRate <= 0 || monetizationRate > 100) {
      monetizationRate = 50; // Default 50% of views are monetized
    }

    // Calculate estimated earnings
    const earnings = ((views * monetizationRate) / 1000) * cpm;
    
    return res.status(200).json({
      message: "Estimated YouTube earnings calculated successfully.",
      data: [{
        views,
        cpm,
        monetizationRate,
        estimatedEarnings: `$${earnings.toFixed(2)}`
      }]
    });
  } catch (error) {
    console.error("Error calculating earnings:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});



const generateChannelNames = async (videoDetails) => {
  try {
    // Create a prompt for Gemini AI to generate 10 YouTube channel name ideas
    const promptText = `
      You are an expert in YouTube branding and content creation.
      Based on the following short video details: "${videoDetails}",
      generate a **list of 10 creative and unique YouTube channel name ideas**.
      Ensure the names are:
      - **Catchy, easy to remember, and SEO-friendly.**
      - **Relevant to the content theme and target audience.**
      - **Diverse in style (e.g., playful, professional, trendy, niche-specific).**

      Return the list **in plain text format**, with each name on a new line.
    `;

    // API request to Gemini AI
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

    // Convert AI response into an array (splitting by new lines)
    const channelNames = aiResponse.split("\n").map(name => name.trim()).filter(name => name.length > 0);

    // Ensure only 10 results are returned
    return channelNames.slice(0, 10);
  } catch (error) {
    console.error("Error fetching AI-generated channel names:", error.response?.data || error.message);
    return ["Error generating channel names."];
  }
};

// API Endpoint to Generate Top 10 YouTube Channel Names
router.post("/generateChannelNames", async (req, res) => {
  try {
    const { videoDetails } = req.body;

    if (!videoDetails || typeof videoDetails !== "string" || videoDetails.length === 0) {
      return res.status(400).json({ message: "Please provide short details about the video." });
    }

    const generatedChannelNames = await generateChannelNames(videoDetails);
    let data =[{videoDetails,
      generatedChannelNames}]
    return res.status(200).json({
      message: "AI-generated YouTube channel name ideas",
      data
    });
  } catch (error) {
    console.error("Error generating AI channel names:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';




// Function to fetch channel details
// const getChannelDetails = async (query) => {
//   try {
//       let url = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`;
//       const response = await axios.get(url);

//       if (!response.data.items.length) return null;

//       let channelId = response.data.items[0].id.channelId;
//       let channelUrl = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${channelId}&key=${YOUTUBE_API_KEY}`;
//       let channelResponse = await axios.get(channelUrl);

//       if (!channelResponse.data.items.length) return null;

//       let channel = channelResponse.data.items[0];

//       return {
//           channelId,
//           title: channel.snippet.title,
//           logo: channel.snippet.thumbnails.high.url,
//           totalViews: parseInt(channel.statistics.viewCount || 0),
//           totalSubscribers: parseInt(channel.statistics.subscriberCount || 0),
//           estimatedMonthlyEarnings: `$${(channel.statistics.viewCount * 0.002).toFixed(2)} - $${(channel.statistics.viewCount * 0.005).toFixed(2)}`,
//           estimatedYearlyEarnings: `$${(channel.statistics.viewCount * 0.024).toFixed(2)} - $${(channel.statistics.viewCount * 0.06).toFixed(2)}`
//       };
//   } catch (error) {
//       console.error('Error fetching channel details:', error);
//       return null;
//   }
// };

// const getTopVideos = async (channelId) => {
//   let videos = [];
//   let nextPageToken = '';

//   try {
//       do {
//           let url = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&maxResults=10&order=viewCount&type=video&key=${YOUTUBE_API_KEY}&pageToken=${nextPageToken}`;
//           const response = await axios.get(url);

//           for (const item of response.data.items) {
//               videos.push({
//                   videoId: item.id.videoId,
//                   title: item.snippet.title,
//                   thumbnail: item.snippet.thumbnails.high.url,
//               });
//           }
//           nextPageToken = response.data.nextPageToken || '';
//       } while (nextPageToken && videos.length < 10);

//       return videos;
//   } catch (error) {
//       console.error('Error fetching videos:', error);
//       return [];
//   }
// };

// const getVideoStats = async (videoIds) => {
//   let stats = [];

//   try {
//       let url = `${YOUTUBE_API_BASE}/videos?part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`;
//       let response = await axios.get(url);

//       stats = response.data.items.map((item) => ({
//           videoId: item.id,
//           views: parseInt(item.statistics.viewCount || 0),
//           likes: parseInt(item.statistics.likeCount || 0),
//           subscribersGained: parseInt(item.statistics.subscriberCount || 0)
//       }));

//       return stats;
//   } catch (error) {
//       console.error('Error fetching video stats:', error);
//       return [];
//   }
// };

// router.get('/channel', async (req, res) => {
//   try {
//       const { query } = req.query;
//       if (!query) return res.status(400).json({ error: 'Channel query is required' });

//       const channel = await getChannelDetails(query);
//       if (!channel) return res.status(404).json({ error: 'Channel not found' });

//       let videos = await getTopVideos(channel.channelId);
//       if (!videos.length) return res.status(404).json({ error: 'No videos found' });

//       let videoIds = videos.map((video) => video.videoId);
//       let stats = await getVideoStats(videoIds);

//       videos = videos.map((video) => {
//           const stat = stats.find((s) => s.videoId === video.videoId) || {};
//           let minEarnings = (stat.views / 1000) * 0.25;
//           let maxEarnings = (stat.views / 1000) * 4.00;
//           return { ...video, views: stat.views || 0, likes: stat.likes || 0, subscribersGained: stat.subscribersGained || 0, minEarnings, maxEarnings };
//       });

//       let totalViews = videos.reduce((acc, video) => acc + video.views, 0);
//       let totalLikes = videos.reduce((acc, video) => acc + video.likes, 0);
//       let totalSubscribersGained = videos.reduce((acc, video) => acc + video.subscribersGained, 0);
//       let totalMinEarnings = videos.reduce((acc, video) => acc + video.minEarnings, 0);
//       let totalMaxEarnings = videos.reduce((acc, video) => acc + video.maxEarnings, 0);

//       return res.json({
//           message: 'Data fetched successfully',
//           data: {
//               channel,
//               totalViews,
//               totalLikes,
//               totalSubscribersGained,
//               videos,
//               totalMinEarnings,
//               totalMaxEarnings,
//           },
//       });
//   } catch (error) {
//       console.error('API Error:', error);
//       return res.status(500).json({ error: 'Internal server error' });
//   }
// });

const getGlobalRanking = async (channelId, country) => {
  try {
      // Replace with actual API or logic to get ranks
      let globalViewsRank = Math.floor(Math.random() * 1000) + 1; // Mocked data
      let globalSubscribersRank = Math.floor(Math.random() * 5000) + 1; // Mocked data
      let countryRank = Math.floor(Math.random() * 1000) + 1; // Mocked data for the country

      return { globalViewsRank, globalSubscribersRank, countryRank };
  } catch (error) {
      console.error("Error fetching global ranking:", error);
      return { globalViewsRank: "N/A", globalSubscribersRank: "N/A", countryRank: "N/A" };
  }
};

const getChannelAndVideosData = async (query) => {
  try {
      let url = `${YOUTUBE_API_BASE}/search?part=snippet&type=channel&q=${encodeURIComponent(query)}&key=${YOUTUBE_API_KEY}`;
      const response = await axios.get(url);

      if (!response.data.items.length) return null;

      let channelId = response.data.items[0].id.channelId;
      let channelUrl = `${YOUTUBE_API_BASE}/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${YOUTUBE_API_KEY}`;
      let videosUrl = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&maxResults=50&order=date&type=video&key=${YOUTUBE_API_KEY}`;

      let [channelResponse, videosResponse] = await Promise.all([axios.get(channelUrl), axios.get(videosUrl)]);

      if (!channelResponse.data.items.length || !videosResponse.data.items.length) return null;

      let channel = channelResponse.data.items[0];
      let country = channel.brandingSettings?.channel?.country || "Unknown";
      let videos = videosResponse.data.items.map(item => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high.url
      }));

      let videoIds = videos.map(video => video.videoId);
      let statsUrl = `${YOUTUBE_API_BASE}/videos?part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`;
      let statsResponse = await axios.get(statsUrl);

      let stats = statsResponse.data.items.map(item => ({
          videoId: item.id,
          views: parseInt(item.statistics.viewCount || 0),
          likes: parseInt(item.statistics.likeCount || 0),
          subscribersGained: parseInt(item.statistics.subscriberCount || 0)
      }));

      videos = videos.map(video => {
          const stat = stats.find(s => s.videoId === video.videoId) || {};
          let minEarnings = (stat.views / 1000) * 0.25;
          let maxEarnings = (stat.views / 1000) * 4.00;
          return { ...video, views: stat.views || 0, likes: stat.likes || 0, subscribersGained: stat.subscribersGained || 0, minEarnings, maxEarnings };
      });

      let totalViews = videos.reduce((acc, video) => acc + video.views, 0);
      let totalLikes = videos.reduce((acc, video) => acc + video.likes, 0);
      let totalSubscribersGained = videos.reduce((acc, video) => acc + video.subscribersGained, 0);
      let totalMinEarnings = videos.reduce((acc, video) => acc + video.minEarnings, 0);
      let totalMaxEarnings = videos.reduce((acc, video) => acc + video.maxEarnings, 0);

      let ranking = await getGlobalRanking(channelId, country);

      return {
          channel: {
              channelId,
              title: channel.snippet.title,
              logo: channel.snippet.thumbnails.high.url,
              country,
              totalViews: parseInt(channel.statistics.viewCount || 0),
              totalSubscribers: parseInt(channel.statistics.subscriberCount || 0),
              estimatedMonthlyEarnings: `$${(channel.statistics.viewCount * 0.002).toFixed(2)} - $${(channel.statistics.viewCount * 0.005).toFixed(2)}`,
              estimatedYearlyEarnings: `$${(channel.statistics.viewCount * 0.024).toFixed(2)} - $${(channel.statistics.viewCount * 0.06).toFixed(2)}`,
              globalViewsRank: ranking.globalViewsRank,
              globalSubscribersRank: ranking.globalSubscribersRank,
              countryRank: ranking.countryRank
          },
          totalViews,
          totalLikes,
          totalSubscribersGained,
          videos,
          totalMinEarnings,
          totalMaxEarnings
      };
  } catch (error) {
      console.error('Error fetching channel and video data:', error);
      return null;
  }
};

router.get('/channel', async (req, res) => {
  try {
      const { query } = req.query;
      if (!query) return res.status(400).json({ error: 'Channel query is required' });

      const data = await getChannelAndVideosData(query);
      if (!data) return res.status(404).json({ error: 'Channel or videos not found' });

      return res.json({
          message: 'Data fetched successfully',
          data
      });
  } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
