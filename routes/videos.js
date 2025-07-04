const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Video = require('../models/video.model');
const Transaction = require('../models/transaction.model');

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

// Middleware to check if user is a creator
const isCreator = async (req, res, next) => {
  if (req.user.userType !== 'creator') {
    return res.status(403).json({ message: 'Only creators can access this endpoint' });
  }
  next();
};

// Add new video (any user with coins can add videos)
router.post('/add', authenticateUser, async (req, res) => {
  try {
    const { youtubeUrl, title, budget, coinsPerView } = req.body;
    
    if (!youtubeUrl || !title || !budget || !coinsPerView) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Validate coins per view (1, 2, or 3)
    if (![1, 2, 3].includes(Number(coinsPerView))) {
      return res.status(400).json({ message: 'Coins per view must be 1, 2, or 3' });
    }
    
    // Check if creator has enough coins
    if (req.user.coins < budget) {
      return res.status(400).json({ message: 'Insufficient coins in your account' });
    }
    
    // Create new video
    const video = new Video({
      creatorId: req.userId,
      youtubeUrl,
      title,
      budget,
      coinsPerView: Number(coinsPerView)
    });
    await video.save();
    
    // Deduct coins from creator's account
    await User.findByIdAndUpdate(req.userId, {
      $inc: { coins: -budget }
    });
    
    // Create transaction record
    const transaction = new Transaction({
      userId: req.userId,
      videoId: video._id,
      type: 'spend',
      amount: 0, // No real money spent
      coins: budget,
      status: 'completed'
    });
    await transaction.save();
    
    return res.status(201).json({
      message: 'Video added successfully',
      video
    });
  } catch (error) {
    console.error('Error adding video:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get user's videos
router.get('/user-videos', authenticateUser, async (req, res) => {
  try {
    const videos = await Video.find({ creatorId: req.userId })
      .sort({ createdAt: -1 });
    
    return res.status(200).json({
      message: 'Videos retrieved successfully',
      videos
    });
  } catch (error) {
    console.error('Error fetching creator videos:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Update video status (Creator only)
router.put('/update/:videoId', authenticateUser, isCreator, async (req, res) => {
  try {
    const { videoId } = req.params;
    const { active } = req.body;
    
    const video = await Video.findById(videoId);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    if (video.creatorId.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'You can only update your own videos' });
    }
    
    video.active = active;
    await video.save();
    
    return res.status(200).json({
      message: 'Video updated successfully',
      video
    });
  } catch (error) {
    console.error('Error updating video:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get available videos for users to watch
router.get('/available', authenticateUser, async (req, res) => {
  try {
    // Find active videos with remaining budget
    const videos = await Video.find({ 
      active: true,
      $expr: { $gt: ["$budget", "$totalCoinsSpent"] }
    }).sort({ coinsPerView: -1 }); // Sort by highest coins per view first
    
    return res.status(200).json({
      message: 'Available videos retrieved',
      videos
    });
  } catch (error) {
    console.error('Error fetching available videos:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Record video view and award coins
router.post('/view/:videoId', authenticateUser, async (req, res) => {
  try {
    const { videoId } = req.params;
    
    const video = await Video.findById(videoId);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    if (!video.active) {
      return res.status(400).json({ message: 'This video is no longer active' });
    }
    
    // Check if video has enough budget left
    if (video.totalCoinsSpent >= video.budget) {
      return res.status(400).json({ message: 'This video has reached its budget limit' });
    }
    
    // Determine coins to award based on user type
    const coinsToAward = req.user.userType === 'normal' ? 1 : video.coinsPerView;
    
    // Update video statistics
    await Video.findByIdAndUpdate(videoId, {
      $inc: { 
        totalViews: 1,
        totalCoinsSpent: coinsToAward
      }
    });
    
    // Award coins to user
    await User.findByIdAndUpdate(req.userId, {
      $inc: { coins: coinsToAward }
    });
    
    // Create transaction record
    const transaction = new Transaction({
      userId: req.userId,
      videoId,
      type: 'earn',
      amount: 0, // No real money earned yet
      coins: coinsToAward,
      status: 'completed'
    });
    await transaction.save();
    
    return res.status(200).json({
      message: 'Video viewed successfully',
      coinsEarned: coinsToAward
    });
  } catch (error) {
    console.error('Error recording video view:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get top creators by budget
router.get('/top-creators', authenticateUser, async (req, res) => {
  try {
    // Aggregate videos by creator and sum their budgets
    const topCreators = await Video.aggregate([
      { $match: { active: true } },
      { $group: {
          _id: "$creatorId",
          totalBudget: { $sum: "$budget" }
        }
      },
      { $sort: { totalBudget: -1 } },
      { $limit: 10 }
    ]);
    
    // Populate creator details
    const creatorIds = topCreators.map(creator => creator._id);
    const creatorDetails = await User.find({ 
      _id: { $in: creatorIds },
      userType: 'creator'
    }, 'FirstName LastName');
    
    // Combine data
    const result = topCreators.map(creator => {
      const details = creatorDetails.find(u => u._id.toString() === creator._id.toString());
      return {
        creatorId: creator._id,
        name: details ? `${details.FirstName} ${details.LastName}` : 'Unknown',
        totalBudget: creator.totalBudget
      };
    });
    
    return res.status(200).json({
      message: 'Top creators retrieved',
      topCreators: result
    });
  } catch (error) {
    console.error('Error fetching top creators:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
